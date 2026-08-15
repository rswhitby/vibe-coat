# datexec_atmosphere — DAT Execute  (new operator)
#
#   DAT parameter:  text1          <- the prompt that feeds StreamDiffusionTD
#   Monitor:        Table Change   (on)
#                   Cell Change    (on, harmless if text1 is a Text DAT)
#
# Pushes the current composed prompt out over the same WebSocket the app
# already uses. Phones display it under "Current atmosphere".
#
# text1 is used rather than null2 because it is the text actually driving
# the image generation — so what visitors read matches what they see.
# To source from the raw agent output instead, change SRC to op('null2').

import json

WS  = op('websocket1')
SRC = op('text1')

_last_sent = None


def _current_prompt():
    """Return the prompt as a string, whether SRC is a Text or Table DAT."""
    try:
        t = SRC.text
        if t and t.strip():
            return t.strip()
    except Exception:
        pass

    # Table DAT: walk backwards for the last non-empty cell
    try:
        for r in range(SRC.numRows - 1, -1, -1):
            for c in range(SRC.numCols - 1, -1, -1):
                v = SRC[r, c].val.strip()
                if v:
                    return v
    except Exception:
        pass

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
