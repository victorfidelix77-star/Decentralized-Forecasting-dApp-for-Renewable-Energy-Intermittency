(define-fungible-token reward-token)

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INSUFFICIENT-BALANCE u101)
(define-constant ERR-INVALID-AMOUNT u102)
(define-constant ERR-MINT-LIMIT-REACHED u103)
(define-constant ERR-BURN-EXCEEDS-BALANCE u104)
(define-constant ERR-TRANSFER-FAILED u105)
(define-constant ERR-MINT-NOT-ENABLED u106)
(define-constant ERR-ADMIN-LOCKED u107)
(define-constant ERR-INVALID-RECIPIENT u108)
(define-constant ERR-INVALID-SENDER u109)
(define-constant ERR-SUPPLY-CAP-EXCEEDED u110)
(define-constant ERR-ZERO-ADDRESS u111)
(define-constant ERR-SELF-TRANSFER u112)
(define-constant ERR-MINT-ZERO u113)
(define-constant ERR-BURN-ZERO u114)

(define-constant MAX-SUPPLY u100000000)
(define-constant INITIAL-MINT u50000000)
(define-constant TOKEN-NAME "Renewable Forecast Token")
(define-constant TOKEN-SYMBOL "RFT")
(define-constant TOKEN-DECIMALS u6)

(define-data-var token-uri (string-utf8 256) u"")
(define-data-var total-minted uint u0)
(define-data-var mint-enabled bool true)
(define-data-var mint-admin principal tx-sender)
(define-data-var burn-enabled bool true)
(define-data-var transfer-enabled bool true)
(define-data-var last-mint-block uint u0)
(define-data-var mint-cooldown uint u144)

(define-map allowances { owner: principal, spender: principal } uint)
(define-map metadata { key: (string-ascii 32) } (string-utf8 512))

(define-read-only (get-name)
  (ok TOKEN-NAME)
)

(define-read-only (get-symbol)
  (ok TOKEN-SYMBOL)
)

(define-read-only (get-decimals)
  (ok TOKEN-DECIMALS)
)

(define-read-only (get-total-supply)
  (ok (ft-get-supply reward-token))
)

(define-read-only (get-balance (account principal))
  (ok (ft-get-balance reward-token account))
)

(define-read-only (get-token-uri)
  (ok (some (var-get token-uri)))
)

(define-read-only (get-allowance (owner principal) (spender principal))
  (ok (default-to u0 (map-get? allowances { owner: owner, spender: spender })))
)

(define-read-only (get-total-minted)
  (ok (var-get total-minted))
)

(define-read-only (get-mint-admin)
  (ok (var-get mint-admin))
)

(define-read-only (get-mint-enabled)
  (ok (var-get mint-enabled))
)

(define-read-only (get-burn-enabled)
  (ok (var-get burn-enabled))
)

(define-read-only (get-transfer-enabled)
  (ok (var-get transfer-enabled))
)

(define-read-only (get-metadata (key (string-ascii 32)))
  (map-get? metadata { key: key })
)

(define-private (is-mint-admin)
  (is-eq tx-sender (var-get mint-admin))
)

(define-private (assert-mint-enabled)
  (asserts! (var-get mint-enabled) (err ERR-MINT-NOT-ENABLED))
)

(define-private (assert-burn-enabled)
  (asserts! (var-get burn-enabled) (err ERR-NOT-AUTHORIZED))
)

(define-private (assert-transfer-enabled)
  (asserts! (var-get transfer-enabled) (err ERR-NOT-AUTHORIZED))
)

(define-private (assert-valid-principal (p principal))
  (asserts! (not (is-eq p tx-sender)) (err ERR-SELF-TRANSFER))
  (asserts! (not (is-eq p 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
)

(define-private (check-cooldown)
  (asserts! (>= block-height (+ (var-get last-mint-block) (var-get mint-cooldown))) (err ERR-NOT-AUTHORIZED))
)

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (assert-transfer-enabled)
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (is-eq tx-sender sender) (err ERR-INVALID-SENDER))
    (try! (assert-valid-principal recipient))
    (match memo m (print m) (ok true))
    (try! (ft-transfer? reward-token amount sender recipient))
    (ok true)
  )
)

(define-public (approve (spender principal) (amount uint))
  (begin
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (not (is-eq spender tx-sender)) (err ERR-SELF-TRANSFER))
    (map-set allowances { owner: tx-sender, spender: spender } amount)
    (ok true)
  )
)

(define-public (transfer-from (owner principal) (recipient principal) (amount uint))
  (let ((allowance (get-allowance owner tx-sender)))
    (assert-transfer-enabled)
    (asserts! (>= allowance amount) (err ERR-INSUFFICIENT-BALANCE))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (try! (assert-valid-principal recipient))
    (map-set allowances { owner: owner, spender: tx-sender } (- allowance amount))
    (try! (ft-transfer? reward-token amount owner recipient))
    (ok true)
  )
)

(define-public (mint (amount uint) (recipient principal))
  (let (
    (current-minted (var-get total-minted))
    (new-total (+ current-minted amount))
  )
    (asserts! (is-mint-admin) (err ERR-NOT-AUTHORIZED))
    (assert-mint-enabled)
    (asserts! (> amount u0) (err ERR-MINT-ZERO))
    (check-cooldown)
    (asserts! (<= new-total MAX-SUPPLY) (err ERR-SUPPLY-CAP-EXCEEDED))
    (try! (assert-valid-principal recipient))
    (try! (ft-mint? reward-token amount recipient))
    (var-set total-minted new-total)
    (var-set last-mint-block block-height)
    (ok true)
  )
)

(define-public (burn (amount uint))
  (begin
    (assert-burn-enabled)
    (asserts! (> amount u0) (err ERR-BURN-ZERO))
    (try! (ft-burn? reward-token amount tx-sender))
    (ok true)
  )
)

(define-public (set-mint-admin (new-admin principal))
  (begin
    (asserts! (is-mint-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin tx-sender)) (err ERR-SELF-TRANSFER))
    (var-set mint-admin new-admin)
    (ok true)
  )
)

(define-public (set-token-uri (new-uri (string-utf8 256)))
  (begin
    (asserts! (is-mint-admin) (err ERR-NOT-AUTHORIZED))
    (var-set token-uri new-uri)
    (ok true)
  )
)

(define-public (toggle-mint)
  (begin
    (asserts! (is-mint-admin) (err ERR-NOT-AUTHORIZED))
    (var-set mint-enabled (not (var-get mint-enabled)))
    (ok (var-get mint-enabled))
  )
)

(define-public (toggle-burn)
  (begin
    (asserts! (is-mint-admin) (err ERR-NOT-AUTHORIZED))
    (var-set burn-enabled (not (var-get burn-enabled)))
    (ok (var-get burn-enabled))
  )
)

(define-public (toggle-transfer)
  (begin
    (asserts! (is-mint-admin) (err ERR-NOT-AUTHORIZED))
    (var-set transfer-enabled (not (var-get transfer-enabled)))
    (ok (var-get transfer-enabled))
  )
)

(define-public (set-mint-cooldown (blocks uint))
  (begin
    (asserts! (is-mint-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (>= blocks u1) (err ERR-INVALID-AMOUNT))
    (var-set mint-cooldown blocks)
    (ok true)
  )
)

(define-public (set-metadata (key (string-ascii 32)) (value (string-utf8 512)))
  (begin
    (asserts! (is-mint-admin) (err ERR-NOT-AUTHORIZED))
    (map-set metadata { key: key } value)
    (ok true)
  )
)

(define-public (initialize)
  (begin
    (asserts! (is-mint-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-eq (var-get total-minted) u0) (err ERR-ADMIN-LOCKED))
    (try! (ft-mint? reward-token INITIAL-MINT tx-sender))
    (var-set total-minted INITIAL-MINT)
    (ok true)
  )
)

(begin
  (map-set metadata { key: "name" } TOKEN-NAME)
  (map-set metadata { key: "symbol" } TOKEN-SYMBOL)
  (map-set metadata { key: "decimals" } "6")
)