import os
import smtplib
from email.message import EmailMessage


SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() in ("1", "true", "yes")
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM", "noreply@example.com")


def send_mail(to: str, subject: str, html: str):
    if not SMTP_HOST:
        return False, "SMTP not configured"
    msg = EmailMessage()
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(html, subtype="html")

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as s:
            if SMTP_USE_TLS:
                s.starttls()
            if SMTP_USER:
                s.login(SMTP_USER, SMTP_PASSWORD or "")
            s.send_message(msg)
        return True, None
    except Exception as e:
        return False, str(e)


def send_invite_email(to: str, link: str, role: str):
    subject = "Your EMSG invite"
    html = f"""
    <p>Hello,</p>
    <p>You have been invited to EMSG with role <b>{role}</b>.</p>
    <p>Please register using this link:</p>
    <p><a href=\"https://{os.getenv('TRAEFIK_DOMAIN', 'localhost')}{link}\">Register</a></p>
    <p>If the link does not work, copy and paste this URL:</p>
    <code>https://{os.getenv('TRAEFIK_DOMAIN', 'localhost')}{link}</code>
    """
    return send_mail(to, subject, html)


def send_account_created_email(to: str, email: str, temp_password: str):
    subject = "Your EMSG account"
    html = f"""
    <p>Hello,</p>
    <p>An administrator created an account for you on EMSG.</p>
    <p><b>Login email:</b> {email}<br/>
    <b>Temporary password:</b> {temp_password}</p>
    <p>Please sign in and change your password.</p>
    <p>Login: <a href=\"https://{os.getenv('TRAEFIK_DOMAIN', 'localhost')}/login\">https://{os.getenv('TRAEFIK_DOMAIN', 'localhost')}/login</a></p>
    """
    return send_mail(to, subject, html)