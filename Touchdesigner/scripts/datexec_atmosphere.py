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


def _current_prompt():
    """Return just the prompt, whether SRC is a Text DAT or a Table DAT.

    Text and Table DATs need different handling and getting this wrong is
    quiet rather than loud:

      - Text DAT:  .text is the body. Reading it cell-by-cell would give
                   you only the last line.
      - Table DAT: .text is the WHOLE table dumped as tab-separated
                   values — headers, user messages, everything. That
                   looks like "the vibes" rather than the prompt.
    """
    try:
        if SRC.isText:
            return SRC.text.strip()

        # Table: last non-empty cell. The agent's reply is appended last,
        # so this lands on the assistant message and skips any header.
        for r in range(SRC.numRows - 1, -1, -1):
            for c in range(SRC.numCols - 1, -1, -1):
                v = SRC[r, c].val.strip()
                if v:
                    return v
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
