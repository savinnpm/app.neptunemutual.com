import { Alert } from '@/common/Alert/Alert'
import { RegularButton } from '@/common/Button/RegularButton'
import { Label } from '@/common/Label/Label'
import { useState, useEffect } from 'react'
import { RadioReport } from '@/common/RadioReport/RadioReport'
import { TokenAmountInput } from '@/common/TokenAmountInput/TokenAmountInput'
import { useVote } from '@/src/hooks/useVote'
import {
  convertFromUnits,
  isGreater,
  isEqualTo,
  convertToUnits,
  toBN
} from '@/utils/bn'
import Link from 'next/link'
import { classNames } from '@/utils/classnames'
import { DataLoadingIndicator } from '@/common/DataLoadingIndicator'
import { t, Trans } from '@lingui/macro'
import { useTokenDecimals } from '@/src/hooks/useTokenDecimals'
import { useCoverStatsContext } from '@/common/Cover/CoverStatsContext'
import { MULTIPLIER } from '@/src/config/constants'
import { Routes } from '@/src/config/routes'
import { analyticsLogger } from '@/utils/logger'
import { log } from '@/src/services/logs'
import { useWeb3React } from '@web3-react/core'
import { useRouter } from 'next/router'

export const CastYourVote = ({ incidentReport }) => {
  const [votingType, setVotingType] = useState('incident-occurred')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')

  const {
    balance,
    tokenAddress,
    tokenSymbol,
    handleApprove,
    handleAttest,
    handleRefute,
    loadingAllowance,
    loadingBalance,
    approving,
    voting,
    canVote,
    isError
  } = useVote({
    value,
    coverKey: incidentReport.coverKey,
    productKey: incidentReport.productKey,
    incidentDate: incidentReport.incidentDate
  })
  const { reporterCommission, minReportingStake } = useCoverStatsContext()

  const tokenDecimals = useTokenDecimals(tokenAddress)

  const { account, chainId } = useWeb3React()
  const { query } = useRouter()

  useEffect(() => {
    if (!value && error) {
      setError('')
      return
    }

    if (!value) {
      return
    }

    if (isGreater(convertToUnits(value), balance)) {
      setError(t`Exceeds maximum balance`)
      return
    }

    if (isEqualTo(convertToUnits(value), 0)) {
      setError(t`Insufficient Balance`)
      return
    }

    if (error) {
      setError('')
    }
  }, [balance, error, value])

  const handleRadioChange = (e) => {
    setVotingType(e.target.value)
  }

  const handleChooseMax = () => {
    setValue(convertFromUnits(balance, tokenDecimals).toString())
  }

  const handleValueChange = (val) => {
    if (typeof val === 'string') {
      setValue(val)
    }
  }

  const isFirstDispute =
    votingType === 'false-reporting' &&
    incidentReport.totalRefutedCount === '0'

  const handleReport = (onTxSuccess) => {
    if (votingType === 'false-reporting') {
      handleRefute()
      return
    }
    handleAttest(onTxSuccess)
  }

  let loadingMessage = ''
  if (loadingBalance) {
    loadingMessage = t`Fetching balance...`
  } else if (loadingAllowance) {
    loadingMessage = t`Fetching allowance...`
  }

  const handleLog = () => {
    const funnel = 'Submit Dispute'
    const journey = `${query?.coverId}${query?.productId ? '-' + query.productId : ''}-${query?.timestamp}-incident-page`
    const sequence = 1
    const step = 'add-dispute-button'
    const event = 'click'

    analyticsLogger(() => {
      log(chainId, funnel, journey, step, sequence, account, event, {})
    })
  }

  return (
    <>
      <h3 className='font-bold text-center lg:text-left text-h3 font-sora'>
        <Trans>Cast Your Vote</Trans>
      </h3>
      <div className='flex flex-col items-center justify-between max-w-lg mt-6 mb-8 sm:justify-start sm:items-start sm:flex-row'>
        <div
          className={classNames(
            'w-full h-18 sm:h-auto mb-4 bg-white border rounded-lg sm:mb-0 sm:bg-transparent sm:rounded-none sm:border-0 lg:mr-4 xl:mr-16 border-B0C4DB focus:outline-none focus-visible:ring-0 focus-visible:ring-4e7dd9',
            votingType === 'incident-occurred' && 'border-2 border-[#4e7dd9]'
          )}
        >
          <RadioReport
            label={t`Incident Occurred`}
            id='incident-radio'
            value='incident-occurred'
            name='vote-radio'
            checked={votingType === 'incident-occurred'}
            onChange={handleRadioChange}
          />
        </div>
        <div
          className={classNames(
            'w-full h-18 sm:h-auto mb-4 bg-white border rounded-lg sm:mb-0 sm:bg-transparent sm:rounded-none sm:border-0 lg:mr-4  xl:mr-16 border-B0C4DB focus:outline-none focus-visible:ring-0 focus-visible:ring-4e7dd9',
            votingType === 'false-reporting' && 'border-2 border-[#4e7dd9]'
          )}
        >
          <RadioReport
            label={t`False Reporting`}
            id='false-radio'
            name='vote-radio'
            value='false-reporting'
            checked={votingType === 'false-reporting'}
            onChange={handleRadioChange}
          />
        </div>
      </div>
      {!isFirstDispute && (
        <>
          <Label
            htmlFor='stake-to-cast-vote'
            className='mb-2 ml-2 font-semibold uppercase'
          >
            <Trans>Stake</Trans>
          </Label>

          <div className='flex flex-wrap items-start gap-8 mb-11'>
            <div className='flex-auto'>
              <TokenAmountInput
                tokenSymbol={tokenSymbol}
                tokenAddress={tokenAddress}
                tokenBalance={balance}
                handleChooseMax={handleChooseMax}
                inputValue={value}
                inputId='stake-to-cast-vote'
                disabled={approving || voting}
                onChange={handleValueChange}
              >
                {isFirstDispute && (
                  <p className='text-9B9B9B'>
                    <Trans>Minimum Stake:</Trans>{' '}
                    {convertFromUnits(
                      minReportingStake,
                      tokenDecimals
                    ).toString()}{' '}
                    NPM
                  </p>
                )}
                {error && (
                  <p className='flex items-center text-FA5C2F'>{error}</p>
                )}
              </TokenAmountInput>
            </div>
            <div className='w-full lg:w-64'>
              {!canVote
                ? (
                  <RegularButton
                    className='w-full py-6 font-semibold leading-6 tracking-wider uppercase lg:w-64 text-h5 whitespace-nowrap text-EEEEEE'
                    onClick={handleApprove}
                    disabled={
                    isError ||
                    approving ||
                    !value ||
                    error ||
                    loadingBalance ||
                    loadingAllowance
                  }
                  >
                    {approving
                      ? (
                          t`Approving...`
                        )
                      : (
                        <>
                          <Trans>Approve</Trans> {tokenSymbol}
                        </>
                        )}
                  </RegularButton>
                  )
                : (
                  <RegularButton
                    className='flex-auto w-full py-6 font-semibold leading-6 tracking-wider uppercase lg:w-64 text-h5 whitespace-nowrap text-EEEEEE'
                    onClick={() => handleReport(() => setValue(''))}
                    disabled={
                    isError ||
                    voting ||
                    error ||
                    loadingBalance ||
                    loadingAllowance
                  }
                  >
                    {voting ? t`Reporting...` : 'Report'}
                  </RegularButton>
                  )}
              <DataLoadingIndicator message={loadingMessage} />
            </div>
          </div>
        </>
      )}
      {isFirstDispute && (
        <>
          <Alert info>
            <Trans>
              Since you are the first person to dispute this incident reporting,
              you will need to stake atleast{' '}
              {convertFromUnits(minReportingStake, tokenDecimals).toString()}{' '}
              NPM tokens. If the majority agree with you, you will earn{' '}
              {toBN(reporterCommission)
                .multipliedBy(100)
                .dividedBy(MULTIPLIER)
                .toString()}
              % of the "incident occurred" side&apos;s tokens.
            </Trans>
          </Alert>
          <Link
            href={Routes.DisputeReport(
              incidentReport.coverKey,
              incidentReport.productKey,
              incidentReport.incidentDate
            )}
            passHref
          >
            <RegularButton
              className='flex-auto w-full py-6 mt-4 font-semibold leading-6 tracking-wider uppercase lg:w-64 mb-11 sm:mb-0 text-h5 whitespace-nowrap text-EEEEEE'
              onClick={handleLog}
            >
              <Trans>Add Dispute</Trans>
            </RegularButton>
          </Link>
        </>
      )}
    </>
  )
}
