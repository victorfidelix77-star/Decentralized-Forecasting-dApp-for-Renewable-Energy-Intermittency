(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-REGION u101)
(define-constant ERR-INVALID-ENERGY u102)
(define-constant ERR-INVALID-CONFIDENCE u103)
(define-constant ERR-INVALID-TIMESTAMP u104)
(define-constant ERR-STAKE-INSUFFICIENT u105)
(define-constant ERR-FORECAST-EXISTS u106)
(define-constant ERR-USER-NOT-REGISTERED u107)
(define-constant ERR-LOCK-PERIOD u108)
(define-constant ERR-INVALID-STAKE-AMOUNT u109)

(define-constant MIN-STAKE u1000000)
(define-constant MIN-CONFIDENCE u1)
(define-constant MAX-CONFIDENCE u100)
(define-constant LOCK-PERIOD u2016)
(define-constant MAX-ENERGY u1000000)

(define-data-var next-forecast-id uint u0)
(define-data-var verifier-contract principal tx-sender)

(define-map user-stakes principal uint)
(define-map user-lock-timestamp principal uint)
(define-map forecasts
  uint
  {
    region-id: uint,
    predicted-mw: uint,
    confidence: uint,
    target-timestamp: uint,
    forecaster: principal,
    stake-amount: uint,
    submitted-at: uint,
    cycle: uint
  }
)

(define-map region-forecasts { region-id: uint, cycle: uint } (list 100 uint))

(define-read-only (get-forecast (id uint))
  (map-get? forecasts id)
)

(define-read-only (get-user-stake (user principal))
  (default-to u0 (map-get? user-stakes user))
)

(define-read-only (get-user-lock (user principal))
  (map-get? user-lock-timestamp user)
)

(define-read-only (get-forecasts-by-region-cycle (region-id uint) (cycle uint))
  (map-get? region-forecasts { region-id: region-id, cycle: cycle })
)

(define-read-only (calculate-cycle (timestamp uint))
  (/ timestamp u144)
)

(define-private (validate-region (region-id uint))
  (asserts! (and (> region-id u0) (<= region-id u1000)) (err ERR-INVALID-REGION))
)

(define-private (validate-energy (mw uint))
  (asserts! (<= mw MAX-ENERGY) (err ERR-INVALID-ENERGY))
)

(define-private (validate-confidence (confidence uint))
  (asserts! (and (>= confidence MIN-CONFIDENCE) (<= confidence MAX-CONFIDENCE)) (err ERR-INVALID-CONFIDENCE))
)

(define-private (validate-future-timestamp (ts uint))
  (asserts! (> ts block-height) (err ERR-INVALID-TIMESTAMP))
)

(define-private (check-stake-requirement (user principal))
  (let ((stake (get-user-stake user)))
    (asserts! (>= stake MIN-STAKE) (err ERR-STAKE-INSUFFICIENT))
  )
)

(define-private (check-lock-period (user principal))
  (match (get-user-lock user)
    lock-time (asserts! (>= block-height (+ lock-time LOCK-PERIOD)) (err ERR-LOCK-PERIOD))
    true
  )
)

(define-public (set-verifier-contract (new-verifier principal))
  (begin
    (asserts! (is-eq tx-sender (var-get verifier-contract)) (err ERR-NOT-AUTHORIZED))
    (var-set verifier-contract new-verifier)
    (ok true)
  )
)

(define-public (stake (amount uint))
  (let ((current (get-user-stake tx-sender)))
    (asserts! (>= amount MIN-STAKE) (err ERR-INVALID-STAKE-AMOUNT))
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    (map-set user-stakes tx-sender (+ current amount))
    (ok true)
  )
)

(define-public (unstake (amount uint))
  (let ((current (get-user-stake tx-sender))
        (lock-time (default-to u0 (get-user-lock tx-sender))))
    (asserts! (>= current amount) (err ERR-STAKE-INSUFFICIENT))
    (asserts! (>= block-height (+ lock-time LOCK-PERIOD)) (err ERR-LOCK-PERIOD))
    (map-set user-stakes tx-sender (- current amount))
    (try! (as-contract (stx-transfer? amount tx-sender tx-sender)))
    (ok true)
  )
)

(define-public (submit-forecast (region-id uint) (predicted-mw uint) (confidence uint) (target-timestamp uint))
  (let (
    (user tx-sender)
    (forecast-id (var-get next-forecast-id))
    (cycle (calculate-cycle target-timestamp))
    (existing-list (default-to (list) (get-forecasts-by-region-cycle region-id cycle)))
  )
    (try! (validate-region region-id))
    (try! (validate-energy predicted-mw))
    (try! (validate-confidence confidence))
    (try! (validate-future-timestamp target-timestamp))
    (check-stake-requirement user)
    (check-lock-period user)
    (asserts! (< (len existing-list) u100) (err ERR-FORECAST-EXISTS))
    (map-set forecasts forecast-id
      {
        region-id: region-id,
        predicted-mw: predicted-mw,
        confidence: confidence,
        target-timestamp: target-timestamp,
        forecaster: user,
        stake-amount: (get-user-stake user),
        submitted-at: block-height,
        cycle: cycle
      }
    )
    (map-set region-forecasts
      { region-id: region-id, cycle: cycle }
      (unwrap! (as-max-len? (append existing-list forecast-id) u100) (err ERR-FORECAST-EXISTS))
    )
    (var-set next-forecast-id (+ forecast-id u1))
    (ok forecast-id)
  )
)

(define-public (lock-stake-on-slash (user principal))
  (begin
    (asserts! (is-eq tx-sender (var-get verifier-contract)) (err ERR-NOT-AUTHORIZED))
    (map-set user-lock-timestamp user block-height)
    (ok true)
  )
)

(define-read-only (get-next-id)
  (ok (var-get next-forecast-id))
)

(define-read-only (get-verifier)
  (ok (var-get verifier-contract))
)