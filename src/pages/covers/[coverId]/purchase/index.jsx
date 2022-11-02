import Head from 'next/head'
import { useRouter } from 'next/router'
import { CoverStatsProvider } from '@/common/Cover/CoverStatsContext'

import { CoverPurchaseDetailsPage } from '@/src/modules/cover/purchase'
import { ComingSoon } from '@/common/ComingSoon'
import { isFeatureEnabled } from '@/src/config/environment'
import { safeFormatBytes32String } from '@/utils/formatter/bytes32String'
import { useWeb3React } from '@web3-react/core'
import { logPageLoad } from '@/src/services/logs'
import { useEffect } from 'react'
import { analyticsLogger } from '@/utils/logger'

const disabled = !isFeatureEnabled('policy')

export default function CoverPurchaseDetails () {
  const router = useRouter()
  const { coverId } = router.query
  const coverKey = safeFormatBytes32String(coverId)
  const productKey = safeFormatBytes32String('')

  const { account, chainId } = useWeb3React()

  useEffect(() => {
    analyticsLogger(() => logPageLoad(chainId ?? null, account ?? null, router.asPath))
  }, [account, chainId, router.asPath])

  if (disabled) {
    return <ComingSoon />
  }

  return (
    <>
      <Head>
        <title>Neptune Mutual Covers</title>
        <meta
          name='description'
          content='Get guaranteed payouts from our parametric cover model. Resolve incidents faster without the need for claims assessment.'
        />
      </Head>

      <CoverStatsProvider coverKey={coverKey} productKey={productKey}>
        <CoverPurchaseDetailsPage />
      </CoverStatsProvider>
    </>
  )
}
