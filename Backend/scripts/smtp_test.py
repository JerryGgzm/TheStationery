"""Diagnose SMTP credentials independently of Supabase.

The Supabase signup 500 is "Error sending confirmation email" caused by a 535
"5.7.8 authentication failed" from the mail server. This script logs in to the
same SMTP server directly so the server's exact response is visible, isolating
whether the credentials themselves are wrong vs. mistyped into Supabase.

The password is read interactively (getpass) so it never lands in shell history
and never needs to be shared.

Usage:
    python scripts/smtp_test.py --host smtp0001.neo.space --port 587 \
        --user info@xinstationary.com --to you@somewhere.com

  --port 587 → STARTTLS (recommended);  --port 465 → implicit SSL.
  --to is optional; when given, it also sends a one-line test email.
"""

from __future__ import annotations

import argparse
import getpass
import smtplib
import ssl
import sys
from email.message import EmailMessage


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--host", required=True)
    p.add_argument("--port", type=int, default=587)
    p.add_argument("--user", required=True, help="full email address, e.g. info@xinstationary.com")
    p.add_argument("--to", help="optional: also send a test email to this address")
    args = p.parse_args()

    password = getpass.getpass(f"SMTP password for {args.user}: ")

    ctx = ssl.create_default_context()
    try:
        if args.port == 465:
            server = smtplib.SMTP_SSL(args.host, args.port, timeout=20, context=ctx)
        else:
            server = smtplib.SMTP(args.host, args.port, timeout=20)
        server.set_debuglevel(1)  # print the full SMTP conversation
        server.ehlo()
        if args.port != 465:
            server.starttls(context=ctx)
            server.ehlo()
        server.login(args.user, password)
        print(f"\n✅ LOGIN OK — {args.host} accepted these credentials.")
        if args.to:
            msg = EmailMessage()
            msg["From"] = args.user
            msg["To"] = args.to
            msg["Subject"] = "The Stationery SMTP test"
            msg.set_content("If you received this, your SMTP settings work.")
            server.send_message(msg)
            print(f"✅ SENT a test email to {args.to} — check the inbox/spam.")
        server.quit()
        return 0
    except smtplib.SMTPAuthenticationError as e:
        print(f"\n❌ AUTH FAILED ({e.smtp_code}): {e.smtp_error!r}")
        print("→ The mail server rejected the username/password. Check that:")
        print("  • Username is the FULL email address (info@xinstationary.com, not 'info').")
        print("  • If 2FA is enabled on the mailbox, use an APP PASSWORD, not the login one.")
        print("  • SMTP / external-client access is enabled for this mailbox in its admin panel.")
        return 1
    except Exception as e:  # noqa: BLE001
        print(f"\n❌ CONNECT/TLS ERROR: {type(e).__name__}: {e}")
        print("→ Try the other port (587 STARTTLS vs 465 SSL) or double-check the host.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
