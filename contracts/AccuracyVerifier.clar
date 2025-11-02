;; contracts/AccuracyVerifier.clar
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-FORECAST-NOT-FOUND u101)
(define-constant ERR-ACTUAL-NOT-SET u102)
(define-constant ERR-INVALID-TIMESTAMP u103)
(define-constant ERR-INVALID-ERROR-MARGIN u104)
(define-constant ERR-INVALID-CONFIDENCE u105)
(define-constant ERR-VERIFICATION-LOCKED u106)
(define-constant ERR-ORACLE-NOT-SET u107)
(define-constant ERR-INVALID-ENERGY-VALUE u108)
(define-constant ERR-INVALID-REGION-ID u109)
(define-constant ERR-SCORE-ALREADY-COMPUTED u110)

(define-constant MAX-ERROR-MARGIN u1000)
(define-constant MIN-CONFIDENCE u1)
(define-constant MAX-CONFIDENCE u100)
(define-constant VERIFICATION-DELAY u144)

(define-data-var oracle-principal (optional principal) none)
(define-data-var next-forecast-id uint u0)

(define-map forecasts
  uint
  {
    region-id: uint,
    predicted-mw: uint,
    confidence: uint,
    timestamp: uint,
    forecaster: principal,
    verified: bool,
    actual-mw: (optional uint),
    error-margin: (optional uint),
    score: (optional uint)
  }
)

(define-map region-actuals
  { region-id: uint, cycle: uint }
  uint
)

(define-map verification-locks
  uint
  uint
)

(define-read-only (get-forecast (id uint))
  (map-get? forecasts id)
)

(define-read-only (get-actual-for-cycle (region-id uint) (cycle uint))
  (map-get? region-actuals { region-id: region-id, cycle: cycle })
)

(define-read-only (get-verification-lock (forecast-id uint))
  (map-get? verification-locks forecast-id)
)

(define-read-only (calculate-cycle (timestamp uint))
  (/ timestamp u144)
)

(define-read-only (compute-absolute-error (predicted uint) (actual uint))
  (if (> predicted actual)
      (- predicted actual)
      (- actual predicted)
  )
)

(define-read-only (compute-relative-error (predicted uint) (actual uint))
  (if (is-eq actual u0)
      u0
      (* u10000 (/ (compute-absolute-error predicted actual) actual))
  )
)

(define-read-only (compute-base-score (error-bp uint))
  (if (>= error-bp u5000)
      u0
      (if (>= error-bp u2500)
          u50
          (if (>= error-bp u1000)
              u75
              (if (>= error-bp u500)
                  u90
                  u100
              )
          )
      )
  )
)

(define-private (validate-region-id (region-id uint))
  (asserts! (and (> region-id u0) (<= region-id u1000)) (err ERR-INVALID-REGION-ID))
)

(define-private (validate-energy-value (mw uint))
  (asserts! (<= mw u1000000) (err ERR-INVALID-ENERGY-VALUE))
)

(define-private (validate-confidence (confidence uint))
  (asserts! (and (>= confidence MIN-CONFIDENCE) (<= confidence MAX-CONFIDENCE)) (err ERR-INVALID-CONFIDENCE))
)

(define-private (validate-timestamp-future (ts uint))
  (asserts! (> ts block-height) (err ERR-INVALID-TIMESTAMP))
)

(define-private (is-oracle-authorized)
  (let ((oracle (var-get oracle-principal)))
    (asserts! (is-some oracle) (err ERR-ORACLE-NOT-SET))
    (asserts! (is-eq (some tx-sender) oracle) (err ERR-NOT-AUTHORIZED))
  )
)

(define-public (set-oracle (new-oracle principal))
  (let ((current (var-get oracle-principal)))
    (asserts! (is-none current) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-oracle tx-sender)) (err ERR-NOT-AUTHORIZED))
    (var-set oracle-principal (some new-oracle))
    (ok true)
  )
)

(define-public (submit-forecast (region-id uint) (predicted-mw uint) (confidence uint) (target-timestamp uint))
  (let (
    (forecast-id (var-get next-forecast-id))
    (cycle (calculate-cycle target-timestamp))
  )
    (try! (validate-region-id region-id))
    (try! (validate-energy-value predicted-mw))
    (try! (validate-confidence confidence))
    (try! (validate-timestamp-future target-timestamp))
    (map-set forecasts forecast-id
      {
        region-id: region-id,
        predicted-mw: predicted-mw,
        confidence: confidence,
        timestamp: target-timestamp,
        forecaster: tx-sender,
        verified: false,
        actual-mw: none,
        error-margin: none,
        score: none
      }
    )
    (map-set verification-locks forecast-id (+ target-timestamp VERIFICATION-DELAY))
    (var-set next-forecast-id (+ forecast-id u1))
    (ok forecast-id)
  )
)

(define-public (submit-actual (region-id uint) (cycle uint) (actual-mw uint))
  (begin
    (is-oracle-authorized)
    (try! (validate-region-id region-id))
    (try! (validate-energy-value actual-mw))
    (map-set region-actuals { region-id: region-id, cycle: cycle } actual-mw)
    (ok true)
  )
)

(define-public (verify-forecast (forecast-id uint))
  (let (
    (forecast (unwrap! (map-get? forecasts forecast-id) (err ERR-FORECAST-NOT-FOUND)))
    (lock-time (unwrap! (map-get? verification-locks forecast-id) (err ERR-VERIFICATION-LOCKED)))
    (current-cycle (calculate-cycle block-height))
    (target-cycle (calculate-cycle (get timestamp forecast)))
    (actual-mw-opt (map-get? region-actuals { region-id: (get region-id forecast), cycle: target-cycle }))
  )
    (asserts! (not (get verified forecast)) (err ERR-SCORE-ALREADY-COMPUTED))
    (asserts! (>= block-height lock-time) (err ERR-VERIFICATION-LOCKED))
    (let ((actual-mw (unwrap! actual-mw-opt (err ERR-ACTUAL-NOT-SET))))
      (let (
        (abs-error (compute-absolute-error (get predicted-mw forecast) actual-mw))
        (rel-error-bp (compute-relative-error (get predicted-mw forecast) actual-mw))
        (base-score (compute-base-score rel-error-bp))
        (confidence-boost (if (> (get confidence forecast) u70) u10 (if (> (get confidence forecast) u40) u5 u0)))
        (final-score (+ base-score confidence-boost))
      )
        (map-set forecasts forecast-id
          (merge forecast
            {
              verified: true,
              actual-mw: (some actual-mw),
              error-margin: (some rel-error-bp),
              score: (some final-score)
            }
          )
        )
        (ok final-score)
      )
    )
  )
)

(define-public (get-forecast-score (forecast-id uint))
  (let ((forecast (unwrap! (map-get? forecasts forecast-id) (err ERR-FORECAST-NOT-FOUND))))
    (ok {
      score: (get score forecast),
      verified: (get verified forecast),
      error-bp: (get error-margin forecast),
      actual: (get actual-mw forecast)
    })
  )
)

(define-public (is-forecast-verifiable (forecast-id uint))
  (let (
    (forecast (unwrap! (map-get? forecasts forecast-id) (err ERR-FORECAST-NOT-FOUND)))
    (lock-time (unwrap! (map-get? verification-locks forecast-id) (err ERR-VERIFICATION-LOCKED)))
    (target-cycle (calculate-cycle (get timestamp forecast)))
    (actual-exists (is-some (map-get? region-actuals { region-id: (get region-id forecast), cycle: target-cycle })))
  )
    (ok (and
      (not (get verified forecast))
      (>= block-height lock-time)
      actual-exists
    ))
  )
)

(define-read-only (get-next-forecast-id)
  (ok (var-get next-forecast-id))
)

(define-read-only (get-oracle)
  (ok (var-get oracle-principal))
)