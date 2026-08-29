"""
Push notification management endpoints.

The Catalyst Cloud Scale Push service manages subscriptions itself — the
front-end uses the Catalyst Web SDK's enableNotification() to subscribe, and
Catalyst stores the subscription internally keyed to the user's Catalyst
account. There is no subscription object to POST from the browser.

The only backend surface needed is:
    GET /api/push/status   — tells the frontend whether push is usable,
                             so it can show or hide the enable button.

Sending is done server-side only (from the digest cron) via push_service.py,
which calls app.push_notification().web().send_notification().
"""
from fastapi import APIRouter, Depends
from typing import Any, Dict

from src.api.auth import get_current_user

router = APIRouter()


@router.get("/push/status")
async def push_status(
    username: str = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Return whether Catalyst Push is configured and available.

    The frontend uses this to decide whether to render the push permission
    prompt. If available=False the component hides itself silently — there
    is no point prompting the user for a feature the server cannot deliver.
    """
    from src.services.push_service import _push_instance, _recipients

    push = _push_instance()
    recipients = _recipients()

    return {
        "available": push is not None,
        "recipients_configured": len(recipients) > 0,
        "note": (
            "Catalyst Cloud Scale Push is active."
            if push is not None
            else (
                "Catalyst SDK not initialised. "
                "Push notifications require the app to run behind the "
                "Catalyst AppSail gateway."
            )
        ),
    }
