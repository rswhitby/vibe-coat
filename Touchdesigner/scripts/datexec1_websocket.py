# datexec1 — DAT Execute
#
#   DAT parameter:  websocket1
#   Monitor:        Table Change  (on)
#
# Replaces the previous version. The relay now sends message types other
# than plain vibes, so this filters on type before appending.
#
# Specifically: on connect the relay sends one {"type":"history", ...}
# message to bring late joiners up to date. TouchDesigner receives it too,
# and the old code would json-parse it, find no "vibe" key, and append a
# blank row to the vibes table every time TD reconnected.

import json

VIBES = op('vibes')


def onTableChange(dat):
    if dat.numRows < 2:
        return

    last = dat[dat.numRows - 1, 0].val
    if not last:
        return

    try:
        d = json.loads(last)
    except Exception as e:
        debug('websocket1: could not parse message —', e)
        return

    mtype = d.get('type', 'vibe')

    # Relay history snapshot. TouchDesigner keeps its own log in the
    # vibes table, so there is nothing here worth taking.
    if mtype == 'history':
        return

    # Our own atmosphere broadcasts shouldn't come back to us — the relay
    # never echoes to the sender — but ignore them defensively.
    if mtype == 'atmosphere' or 'atmosphere' in d:
        return

    vibe = (d.get('vibe') or '').strip()
    if not vibe:
        return

    VIBES.appendRow([
        vibe,
        d.get('from', ''),
        d.get('timestamp', ''),
    ])
    return
