import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InviteService } from '../../../social/services/InviteService'
import { useInviteState } from '../../../social/services/InviteService'
import { INVITE_PAGE_LIMIT } from '../../../social/services/InviteService'
import ConfirmModal from '../../common/ConfirmModal'
import TableComponent from '../../common/Table'
import { inviteColumns } from '../../common/variables/invite'
import styles from '../../styles/admin.module.scss'

interface Props {
  search: string
}

const SentInvite = (props: Props) => {
  const { search } = props
  const [page, setPage] = useState(0)
  const [popConfirmOpen, setPopConfirmOpen] = useState(false)
  const [inviteId, setInviteId] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [rowsPerPage, setRowsPerPage] = useState(INVITE_PAGE_LIMIT)
  const inviteState = useInviteState()
  const [fieldOrder, setFieldOrder] = useState('asc')
  const [sortField, setSortField] = useState('id')
  const { t } = useTranslation()
  const invites = inviteState.sentInvites.invites
  const sentInviteCount = inviteState.sentInvites.total.value

  const deleteInvite = () => {
    InviteService.removeInvite(inviteId)
    handleCloseModal()
  }

  const handlePageChange = (event: React.MouseEvent<HTMLButtonElement> | null, newPage: number) => {
    const incDec = page < newPage ? 'increment' : 'decrement'
    InviteService.retrieveSentInvites(incDec, search, sortField, fieldOrder)
    setPage(newPage)
  }

  useEffect(() => {
    InviteService.retrieveSentInvites(undefined, search, sortField, fieldOrder)
  }, [search, inviteState.receivedUpdateNeeded.value, sortField, fieldOrder])

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10))
    setPage(0)
  }

  const handleCloseModal = () => {
    setPopConfirmOpen(false)
  }

  const createData = (id: string, name: string, passcode: string, type: string) => {
    return {
      id,
      name,
      passcode,
      type,
      action: (
        <>
          <a
            href="#h"
            className={styles.actionStyle}
            onClick={() => {
              setPopConfirmOpen(true)
              setInviteId(id)
              setInviteName(name)
            }}
          >
            <span className={styles.spanDange}>{t('admin:components.index.delete')}</span>
          </a>
        </>
      )
    }
  }

  const rows = invites.value.map((el, index) => createData(el.id, el.invitee?.name || '', el.passcode, el.inviteType))

  return (
    <React.Fragment>
      <TableComponent
        allowSort={false}
        fieldOrder={fieldOrder}
        setSortField={setSortField}
        setFieldOrder={setFieldOrder}
        rows={rows}
        column={inviteColumns}
        page={page}
        rowsPerPage={rowsPerPage}
        count={sentInviteCount}
        handlePageChange={handlePageChange}
        handleRowsPerPageChange={handleRowsPerPageChange}
      />
      <ConfirmModal
        popConfirmOpen={popConfirmOpen}
        handleCloseModal={handleCloseModal}
        submit={deleteInvite}
        name={inviteName}
        label={'invite'}
      />
    </React.Fragment>
  )
}

export default SentInvite
