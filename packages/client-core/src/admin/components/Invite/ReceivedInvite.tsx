import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { InviteService } from '../../../social/services/InviteService'
import { INVITE_PAGE_LIMIT, useInviteState } from '../../../social/services/InviteService'
import ConfirmModal from '../../common/ConfirmModal'
import TableComponent from '../../common/Table'
import { inviteColumns } from '../../common/variables/invite'
import styles from '../../styles/admin.module.scss'

interface Props {
  search: string
}

const ReceivedInvite = (props: Props) => {
  const { search } = props
  const [page, setPage] = useState(0)
  const [inviteId, setInviteId] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [popConfirmOpen, setPopConfirmOpen] = useState(false)
  const [rowsPerPage, setRowsPerPage] = useState(INVITE_PAGE_LIMIT)
  const inviteState = useInviteState()
  const [fieldOrder, setFieldOrder] = useState('asc')
  const [sortField, setSortField] = useState('id')
  const invites = inviteState.receivedInvites.invites
  const receivedInviteCount = inviteState.receivedInvites.total.value

  const { t } = useTranslation()

  const handlePageChange = (event: React.MouseEvent<HTMLButtonElement> | null, newPage: number) => {
    const incDec = page < newPage ? 'increment' : 'decrement'
    InviteService.retrieveReceivedInvites(incDec, search, sortField, fieldOrder)
    setPage(newPage)
  }

  useEffect(() => {
    InviteService.retrieveReceivedInvites(undefined, search, sortField, fieldOrder)
  }, [search, inviteState.receivedUpdateNeeded.value, sortField, fieldOrder])

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10))
    setPage(0)
  }

  const handleCloseModal = () => {
    setPopConfirmOpen(false)
  }

  const deleteInvite = () => {
    InviteService.removeInvite(inviteId)
    handleCloseModal()
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

  const rows = invites.value.map((el, index) => createData(el.id, el.user?.name || '', el.passcode, el.inviteType))

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
        count={receivedInviteCount}
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

export default ReceivedInvite
