# UIDAI certificates

Public certificates UIDAI publishes for validating the signature on **Aadhaar Paperless Offline e-KYC** and the
**Secure QR Code** (https://uidai.gov.in/en/data-and-download, "UIDAI Certificates Details"). Downloaded 2026-11-21.
They are public, safe to commit. Expired ones are kept on purpose: older Aadhaar cards / letters carry QRs signed
with older keys, and a signature can still be checked after its certificate expires.

- uidai_offline_publickey_2026.cer  (valid to 03 Feb 2029, the current key)
- uidai_offline_publickey_17022026 / 26022021 / 29032019 / 26022019 (older offline e-KYC keys)
- uidai_12_06_18_cer.cer, uidai_prod_cdup.cer (older Secure QR keys)

Until a real Aadhaar QR has been confirmed to verify, a failed signature goes to ops review (flag SIGNATURE_FAILED)
instead of being refused. Set `UIDAI_STRICT=1` on Render to refuse failed signatures outright.
