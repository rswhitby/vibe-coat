# datexec_atmosphere — DAT Execute  (new operator)
#
#   DAT parameter:  null2          <- the composed prompt from the agent
#   Monitor:        Table Change   (on)
#                   Cell Change    (on)
#
# Pushes the current composed prompt out over the same WebSocket the app
# already uses. Phones display it under "Current atmosphere".
#
# SRC is whichever operator holds the finished prompt. Check with:
#
#   for n in ('text1','null1','null2'):
#       d = op(n); print(n, d.isText, d.isTable, d.numRows, d.numCols)
#       print(repr(d.text[:200]))

import json

WS  = op('websocket1')
SRC = op('null2')

_last_sent = None


PROMPT_ROW = 1
PROMPT_COL = 0


def _current_prompt():
    """The composed prompt lives in null2 row 1, col 0.

    Read that cell directly. Do NOT use SRC.text on a Table DAT — it
    returns the whole table as tab-separated values, header row and user
    messages included, which is what was previously being sent.
    """
    try:
        if SRC.numRows <= PROMPT_ROW:
            return ''
        return SRC[PROMPT_ROW, PROMPT_COL].val.strip()
    except Exception as e:
        debug('atmosphere: could not read', SRC.path, '—', e)
        return ''


def send_atmosphere():
    """Send only when the prompt has actually changed."""
    global _last_sent

    text = _current_prompt()
    if not text or text == _last_sent:
        return

    try:
        WS.sendText(json.dumps({'type': 'atmosphere', 'text': text}))
        _last_sent = text
    except Exception as e:
        # Socket down or reconnecting — leave _last_sent alone so the next
        # cook retries instead of silently skipping this prompt.
        debug('atmosphere send failed —', e)
    return


def onTableChange(dat):
    send_atmosphere()
    return


def onCellChange(dat, cells, prev):
    send_atmosphere()
    return
