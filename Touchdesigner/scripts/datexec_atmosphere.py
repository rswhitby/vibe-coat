# datexec_atmosphere — DAT Execute
#
#   DAT parameter:  null2          <- the composed prompt from the agent
#   Monitor:        Table Change   (on)
#                   Cell Change    (on)
#
# Sends the whole Current Vibes state to the phones in one message:
# the vibe list from select1 and the composed prompt from null2.
#
# TouchDesigner is the source of truth for both. The phones used to
# accumulate vibes themselves from relay broadcasts, which meant each
# phone only ever saw what arrived while it happened to be connected —
# and the relay's memory resets whenever Railway restarts. Sending the
# list from here means every phone shows the same thing, always.

import json

WS         = op('websocket1')
PROMPT_SRC = op('null2')      # composed prompt, row 1 col 0
VIBES_SRC  = op('select1')    # current vibe list, column 0

PROMPT_ROW = 1
PROMPT_COL = 0

_last_sent = None


def _current_prompt():
    """The composed prompt lives in null2 row 1, col 0.

    Read that cell directly. Do NOT use .text on a Table DAT — it returns
    the whole table as tab-separated values, header row included.
    """
    try:
        if PROMPT_SRC.numRows <= PROMPT_ROW:
            return ''
        return PROMPT_SRC[PROMPT_ROW, PROMPT_COL].val.strip()
    except Exception as e:
        debug('atmosphere: could not read', PROMPT_SRC.path, '—', e)
        return ''


def _current_vibes():
    """Every non-empty cell in select1 column 0, oldest first."""
    out = []
    try:
        for r in range(VIBES_SRC.numRows):
            v = VIBES_SRC[r, 0].val.strip()
            if v:
                out.append(v)
    except Exception as e:
        debug('atmosphere: could not read', VIBES_SRC.path, '—', e)
    return out


def send_state():
    """Broadcast vibes + prompt. Only sends when something changed."""
    global _last_sent

    payload = {
        'type': 'state',
        'vibes': _current_vibes(),
        'atmosphere': _current_prompt(),
    }

    if not payload['vibes'] and not payload['atmosphere']:
        return

    body = json.dumps(payload)
    if body == _last_sent:
        return

    try:
        WS.sendText(body)
        _last_sent = body
    except Exception as e:
        # Leave _last_sent alone so the next cook retries rather than
        # silently skipping this update.
        debug('state send failed —', e)
    return


def onTableChange(dat):
    send_state()
    return


def onCellChange(dat, cells, prev):
    send_state()
    return
