import { useState, useEffect } from 'react'
import { useWeb3React } from '@web3-react/core'
import { registry, utils } from '@neptunemutual/sdk'

import {
  convertToUnits,
  isValidNumber,
  isGreaterOrEqual,
  isGreater,
  convertFromUnits
} from '@/utils/bn'
import { getProviderOrSigner } from '@/lib/connect-wallet/utils/web3'
import { useTxToast } from '@/src/hooks/useTxToast'
import { useErrorNotifier } from '@/src/hooks/useErrorNotifier'
import { useNetwork } from '@/src/context/Network'
import { useTxPoster } from '@/src/context/TxPoster'
import { useAppConstants } from '@/src/context/AppConstants'
import { useERC20Balance } from '@/src/hooks/useERC20Balance'
import { useERC20Allowance } from '@/src/hooks/useERC20Allowance'
import { usePolicyAddress } from '@/src/hooks/contracts/usePolicyAddress'
import { formatCurrency } from '@/utils/formatter/currency'
import { t } from '@lingui/macro'
import { useRouter } from 'next/router'
import {
  STATUS,
  TransactionHistory
} from '@/src/services/transactions/transaction-history'
import { METHODS } from '@/src/services/transactions/const'
import { getActionMessage } from '@/src/helpers/notification'
import { storePurchaseEvent } from '@/src/hooks/useFetchCoverPurchasedEvent'
import { log, logPolicyPurchase } from '@/src/services/logs'
import { analyticsLogger } from '@/utils/logger'
import { safeParseBytes32String } from '@/utils/formatter/bytes32String'
import { getMonthNames } from '@/lib/dates'
import { NetworkNames } from '@/lib/connect-wallet/config/chains'

export const usePurchasePolicy = ({
  coverKey,
  productKey,
  value,
  feeAmount,
  coverMonth,
  availableLiquidity,
  liquidityTokenSymbol,
  referralCode
}) => {
  const { library, account } = useWeb3React()
  const { networkId } = useNetwork()

  const [approving, setApproving] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [error, setError] = useState('')

  const [txHash, setTxHash] = useState('')
  const [purchaseWaiting, setPurchaseWaiting] = useState(false)

  const txToast = useTxToast()
  const policyContractAddress = usePolicyAddress()
  const { liquidityTokenAddress, liquidityTokenDecimals } = useAppConstants()
  const {
    balance,
    refetch: updateBalance,
    loading: updatingBalance
  } = useERC20Balance(liquidityTokenAddress)
  const {
    allowance,
    approve,
    refetch: updateAllowance,
    loading: updatingAllowance
  } = useERC20Allowance(liquidityTokenAddress)
  const { writeContract } = useTxPoster()
  const { notifyError } = useErrorNotifier()
  const router = useRouter()

  const now = new Date()
  const currentMonthIndex = now.getUTCMonth()
  const year = now.getUTCFullYear()

  useEffect(() => {
    updateAllowance(policyContractAddress)
  }, [policyContractAddress, updateAllowance])

  useEffect(() => {
    if (!value && error) {
      setError('')
      return
    }

    if (!value) {
      return
    }

    if (!account) {
      setError(t`Please connect your wallet`)
      return
    }

    if (!isValidNumber(value)) {
      setError(t`Invalid amount to cover`)
      return
    }

    if (isGreater(feeAmount || '0', balance || '0')) {
      setError(t`Insufficient Balance`)
      return
    }

    if (isGreater(value || 0, availableLiquidity || 0)) {
      setError(
        t`Maximum protection available is ${
          formatCurrency(availableLiquidity, router.locale).short
        }`
      )
      return
    }

    if (error) {
      setError('')
    }
  }, [
    account,
    availableLiquidity,
    balance,
    error,
    feeAmount,
    router.locale,
    value
  ])

  const handleApprove = async () => {
    setApproving(true)

    const cleanup = () => {
      setApproving(false)
    }

    const handleError = (err) => {
      notifyError(err, t`Could not approve ${liquidityTokenSymbol}`)
    }

    try {
      const onTransactionResult = async (tx) => {
        TransactionHistory.push({
          hash: tx.hash,
          methodName: METHODS.POLICY_APPROVE,
          status: STATUS.PENDING,
          data: {
            value,
            tokenSymbol: liquidityTokenSymbol
          }
        })

        await txToast.push(
          tx,
          {
            pending: getActionMessage(METHODS.POLICY_APPROVE, STATUS.PENDING, {
              value,
              tokenSymbol: liquidityTokenSymbol
            }).title,
            success: getActionMessage(METHODS.POLICY_APPROVE, STATUS.SUCCESS, {
              value,
              tokenSymbol: liquidityTokenSymbol
            }).title,
            failure: getActionMessage(METHODS.POLICY_APPROVE, STATUS.FAILED, {
              value,
              tokenSymbol: liquidityTokenSymbol
            }).title
          },
          {
            onTxSuccess: () => {
              TransactionHistory.push({
                hash: tx.hash,
                methodName: METHODS.POLICY_APPROVE,
                status: STATUS.SUCCESS
              })
              analyticsLogger(() => {
                log(networkId, 'Purchase Policy', 'purchase-policy-page', 'approve-button', 1, 'click')
              })
            },
            onTxFailure: () => {
              TransactionHistory.push({
                hash: tx.hash,
                methodName: METHODS.POLICY_APPROVE,
                status: STATUS.FAILED
              })
            }
          }
        )
        cleanup()
      }

      const onRetryCancel = () => {
        cleanup()
      }

      const onError = (err) => {
        handleError(err)
        cleanup()
      }

      approve(policyContractAddress, feeAmount, {
        onTransactionResult,
        onRetryCancel,
        onError
      })
    } catch (err) {
      handleError(err)
      cleanup()
    }
  }

  const handlePurchase = async (onTxSuccess) => {
    setPurchasing(true)

    const cleanup = async () => {
      setPurchasing(false)
      return Promise.all([updateAllowance(policyContractAddress), updateBalance()])
    }

    const handleError = (err) => {
      notifyError(err, t`Could not purchase policy`)
    }

    try {
      const signerOrProvider = getProviderOrSigner(library, account, networkId)

      const policyContract = await registry.PolicyContract.getInstance(
        networkId,
        signerOrProvider
      )

      const onTransactionResult = async (tx) => {
        setPurchaseWaiting(true)

        TransactionHistory.push({
          hash: tx.hash,
          methodName: METHODS.POLICY_PURCHASE,
          status: STATUS.PENDING,
          data: {
            value,
            tokenSymbol: liquidityTokenSymbol
          }
        })

        await txToast.push(
          tx,
          {
            pending: t`Purchasing Policy`,
            success: t`Purchased Policy Successfully`,
            failure: t`Could not purchase policy`
          },
          {
            onTxSuccess: () => {
              TransactionHistory.push({
                hash: tx.hash,
                methodName: METHODS.POLICY_PURCHASE,
                status: STATUS.SUCCESS
              })

              tx.wait(1).then(async (receipt) => {
                if (receipt) {
                  const events = receipt.events
                  const event = events.find(
                    (x) => x.event === 'CoverPurchased'
                  )
                  const txHash = storePurchaseEvent(event, receipt.from)

                  setTxHash(txHash)
                }
              })

              analyticsLogger(() => {
                log(networkId, 'Purchase Policy', 'purchase-policy-page', 'purchase-policy-button', 2, 'click')
                logPolicyPurchase({
                  networkId,
                  network: NetworkNames[networkId],
                  account,
                  coverKey,
                  coverName: safeParseBytes32String(coverKey),
                  productKey,
                  productName: safeParseBytes32String(productKey),
                  coverFee: convertFromUnits(feeAmount, liquidityTokenDecimals),
                  coverFeeCurrency: liquidityTokenSymbol,
                  coverFeeFormatted: formatCurrency(
                    convertFromUnits(feeAmount, liquidityTokenDecimals),
                    router.locale,
                    liquidityTokenSymbol,
                    true
                  ).short,
                  protection: value,
                  protectionCurrency: liquidityTokenSymbol,
                  protectionFormatted: formatCurrency(
                    value,
                    router.locale,
                    liquidityTokenSymbol,
                    true
                  ).short,
                  sales: value,
                  salesCurrency: liquidityTokenSymbol,
                  salesFormatted: formatCurrency(
                    value,
                    router.locale,
                    liquidityTokenSymbol,
                    true
                  ).short,
                  coveragePeriod: coverMonth,
                  coverMonthFormatted: coverMonth + ' months',
                  coveragePeriodMonth: currentMonthIndex + parseInt(coverMonth),
                  coveragePeriodMonthFormatted: getMonthNames(router.locale)[(currentMonthIndex - 1 + parseInt(coverMonth)) % 12],
                  coveragePeriodYear: (currentMonthIndex + parseInt(coverMonth)) % 12 === 0 ? year : year + 1,
                  referralCode: referralCode,
                  tx: tx.hash
                })
              })

              onTxSuccess()
            },
            onTxFailure: () => {
              TransactionHistory.push({
                hash: tx.hash,
                methodName: METHODS.POLICY_PURCHASE,
                status: STATUS.FAILED
              })
            }
          }
        )

        cleanup()
      }

      const onRetryCancel = () => {
        cleanup()
      }

      const onError = (err) => {
        handleError(err)
        cleanup()
      }

      const args = {
        onBehalfOf: account,
        coverKey: coverKey,
        productKey: productKey || utils.keyUtil.toBytes32(''),
        coverDuration: parseInt(coverMonth, 10),
        amountToCover: convertToUnits(value, liquidityTokenDecimals).toString(),
        referralCode: utils.keyUtil.toBytes32(referralCode)
      }

      writeContract({
        instance: policyContract,
        methodName: 'purchaseCover',
        args: [args],
        onTransactionResult,
        onRetryCancel,
        onError
      })
    } catch (err) {
      handleError(err)
      cleanup()
    }
  }

  const canPurchase =
    value &&
    isValidNumber(value) &&
    isGreaterOrEqual(allowance || '0', feeAmount || '0')

  return {
    txHash,
    purchaseWaiting,
    balance,
    allowance,
    approving,
    updatingAllowance,
    purchasing,
    canPurchase,
    error,
    handleApprove,
    handlePurchase,
    updatingBalance
  }
}
