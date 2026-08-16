# datexec_vibes — DAT Execute  (second operator)
#
#   DAT parameter:  select1
#   Monitor:        Table Change   (on)
#                   Cell Change    (on)
#
# Fires the moment a vibe lands, without waiting for the agent.
#
# The other DAT Execute watches null2, which only changes once the LLM
# has finished composing. With that as the only trigger the phones stayed
# a full agent round-trip behind: you'd add a vibe and see nothing until
# the next prompt came back.
#
# Both operators call the same send_state(), so _last_sent is shared and
# a change that touches select1 and null2 together still sends once.
#
# Rename ATMOS below if you called the other DAT Execute something else.

ATMOS = 'datexec_atmosphere'


def _send():
    op(ATMOS).module.send_state()


def onTableChange(dat):
    _send()
    return


def onCellChange(dat, cells, prev):
    _send()
    return


def onRowChange(dat, rows):
    _send()
    return


def onSizeChange(dat):
    _send()
    return
