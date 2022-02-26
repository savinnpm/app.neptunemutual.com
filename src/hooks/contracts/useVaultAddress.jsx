import { useState, useEffect } from "react";
import { useWeb3React } from "@web3-react/core";
import { registry } from "@neptunemutual/sdk";

import { getProviderOrSigner } from "@/lib/connect-wallet/utils/web3";
import { useAppContext } from "@/src/context/AppWrapper";

export const useVaultAddress = ({ coverKey }) => {
  const [address, setAddress] = useState(null);
  const { networkId } = useAppContext();
  const { library, account } = useWeb3React();

  useEffect(() => {
    let ignore = false;
    if (!networkId || !account) return;

    async function exec() {
      const signerOrProvider = getProviderOrSigner(library, account, networkId);

      const vaultAddress = await registry.Vault.getAddress(
        networkId,
        coverKey,
        signerOrProvider
      );

      if (ignore) return;
      setAddress(vaultAddress);
    }

    exec();

    return () => {
      ignore = true;
    };
  }, [account, coverKey, library, networkId]);

  return address;
};
