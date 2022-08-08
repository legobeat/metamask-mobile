/* eslint-disable no-mixed-spaces-and-tabs */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import EditGasFee1559Update from '../EditGasFee1559Update';
import { connect } from 'react-redux';
import {
  CANCEL_RATE,
  SPEED_UP_RATE,
  GAS_ESTIMATE_TYPES,
} from '@metamask/controllers';
import { hexToBN, fromWei, renderFromWei } from '../../../util/number';
import BigNumber from 'bignumber.js';
import { getTicker } from '../../../util/transactions';
import AppConstants from '../../../core/AppConstants';
import { strings } from '../../../../locales/i18n';
import { startGasPolling, stopGasPolling } from '../../../core/gasPolling';

/**
 * View that renders a list of transactions for a specific asset
 */

interface Props {
  /**
   * Map of accounts to information objects including balances
   */
  accounts: any;
  /**
   * Chain Id
   */
  chainId: string;
  /**
   * ETH or fiat, depending on user setting
   */
  primaryCurrency: string;
  /**
   * Gas fee estimates returned by the gas fee controller
   */
  gasFeeEstimates: any;
  /**
   * Estimate type returned by the gas fee controller, can be market-fee, legacy or eth_gasPrice
   */
  gasEstimateType: string;
  /**
   * A string that represents the selected address
   */
  selectedAddress: string;
  /**
   * A bool indicates whether tx is speed up/cancel
   */
  isCancel: boolean;
  /**
   * Current provider ticker
   */
  ticker: string;
  /**
   * The max fee and max priorty fee selected tx
   */
  existingGas: any;
  /**
   * Gas object used to get suggestedGasLimit
   */
  gas: any;
  /**
   * Function that cancels the tx update
   */
  onCancel: () => void;
  /**
   * Function that performs the rest of the tx update
   */
  onSave: (tx: any) => void;
}

interface GasTxnProp {
  error: any;
  estimatedBaseFee: string;
  estimatedBaseFeeHex: string;
  gasFeeMaxConversion: string;
  gasFeeMaxNative: string;
  gasFeeMinConversion: string;
  gasFeeMinNative: string;
  gasLimitHex: string;
  maxPriorityFeeConversion: string;
  maxPriorityFeeNative: string;
  renderableGasFeeMaxConversion: string;
  renderableGasFeeMaxNative: string;
  renderableGasFeeMinConversion: string;
  renderableGasFeeMinNative: string;
  renderableMaxFeePerGasConversion: string;
  renderableMaxFeePerGasNative: string;
  renderableMaxPriorityFeeConversion: string;
  renderableMaxPriorityFeeNative: string;
  suggestedEstimatedGasLimit: string | undefined;
  suggestedGasLimit: string;
  suggestedMaxFeePerGas: string;
  suggestedMaxFeePerGasHex: string;
  suggestedMaxPriorityFeePerGas: string;
  suggestedMaxPriorityFeePerGasHex: string;
  timeEstimate: string;
  timeEstimateColor: string;
  timeEstimateId: string;
  totalMaxHex: string;
}

interface UpdateTx1559Options {
  /**
   * The legacy calculated max priorty fee used in subcomponent for threshold warning messages
   */
  maxPriortyFeeThreshold: BigNumber;
  /**
   * The legacy calculated max fee used in subcomponent for threshold warning messages
   */
  maxFeeThreshold: BigNumber;
  /**
   * Boolean to indicate to sumcomponent if the view should display only advanced settings
   */
  showAdvanced: boolean;
  /**
   * Boolean to indicate if this is a cancel tx update
   */
  isCancel: boolean;
}

const UpdateEIP1559Tx = ({
  gas,
  accounts,
  selectedAddress,
  ticker,
  existingGas,
  gasFeeEstimates,
  gasEstimateType,
  primaryCurrency,
  isCancel,
  chainId,
  onCancel,
  onSave,
}: Props) => {
  const [animateOnGasChange, setAnimateOnGasChange] = useState(false);
  const [gasSelected, setGasSelected] = useState(
    AppConstants.GAS_OPTIONS.MEDIUM,
  );
  const stopUpdateGas = useRef(false);
  /**
   * Flag to only display high gas selection option if the legacy is higher then low/med
   */
  const onlyDisplayHigh = useRef(false);
  /**
   * Options
   */
  const updateTx1559Options = useRef<UpdateTx1559Options | undefined>();
  const pollToken = useRef(undefined);
  const firstTime = useRef(true);

  const suggestedGasLimit = fromWei(gas, 'wei');

  useEffect(() => {
    if (animateOnGasChange) setAnimateOnGasChange(false);
  }, [animateOnGasChange]);

  useEffect(() => {
    const startGasEstimatePolling = async () => {
      pollToken.current = await startGasPolling(pollToken.current);
    };
    startGasEstimatePolling();

    return () => {
      stopGasPolling();
    };
  }, []);

  const isMaxFeePerGasMoreThanLegacy = useCallback(
    (maxFeePerGas: BigNumber) => {
      const newDecMaxFeePerGas = new BigNumber(existingGas.maxFeePerGas).times(
        new BigNumber(isCancel ? CANCEL_RATE : SPEED_UP_RATE),
      );
      return {
        result: maxFeePerGas.gte(newDecMaxFeePerGas),
        value: newDecMaxFeePerGas,
      };
    },
    [existingGas.maxFeePerGas, isCancel],
  );

  const isMaxPriorityFeePerGasMoreThanLegacy = useCallback(
    (maxPriorityFeePerGas: BigNumber) => {
      const newDecMaxPriorityFeePerGas = new BigNumber(
        existingGas.maxPriorityFeePerGas,
      ).times(new BigNumber(isCancel ? CANCEL_RATE : SPEED_UP_RATE));
      return {
        result: maxPriorityFeePerGas.gte(newDecMaxPriorityFeePerGas),
        value: newDecMaxPriorityFeePerGas,
      };
    },
    [existingGas.maxPriorityFeePerGas, isCancel],
  );

  const validateAmount = useCallback(
    (updateTx) => {
      let error;

      const updateTxCost: any = hexToBN(`0x${updateTx.totalMaxHex}`);
      const accountBalance: any = hexToBN(accounts[selectedAddress].balance);
      const isMaxFeePerGasMoreThanLegacyResult = isMaxFeePerGasMoreThanLegacy(
        new BigNumber(updateTx.suggestedMaxFeePerGas),
      );
      const isMaxPriorityFeePerGasMoreThanLegacyResult =
        isMaxPriorityFeePerGasMoreThanLegacy(
          new BigNumber(updateTx.suggestedMaxPriorityFeePerGas),
        );
      if (accountBalance.lt(updateTxCost)) {
        const amount = renderFromWei(updateTxCost.sub(accountBalance));
        const tokenSymbol = getTicker(ticker);
        error = strings('transaction.insufficient_amount', {
          amount,
          tokenSymbol,
        });
      } else if (!isMaxFeePerGasMoreThanLegacyResult.result) {
        error = isCancel
          ? strings('edit_gas_fee_eip1559.max_fee_cancel_low', {
              cancel_value: isMaxFeePerGasMoreThanLegacyResult.value,
            })
          : strings('edit_gas_fee_eip1559.max_fee_speed_up_low', {
              speed_up_floor_value: isMaxFeePerGasMoreThanLegacyResult.value,
            });
      } else if (!isMaxPriorityFeePerGasMoreThanLegacyResult.result) {
        error = isCancel
          ? strings('edit_gas_fee_eip1559.max_priority_fee_cancel_low', {
              cancel_value: isMaxPriorityFeePerGasMoreThanLegacyResult.value,
            })
          : strings('edit_gas_fee_eip1559.max_priority_fee_speed_up_low', {
              speed_up_floor_value:
                isMaxPriorityFeePerGasMoreThanLegacyResult.value,
            });
      }

      return error;
    },
    [
      accounts,
      selectedAddress,
      isMaxFeePerGasMoreThanLegacy,
      isMaxPriorityFeePerGasMoreThanLegacy,
      ticker,
      isCancel,
    ],
  );

  useEffect(() => {
    if (stopUpdateGas.current) return;
    if (gasEstimateType === GAS_ESTIMATE_TYPES.FEE_MARKET) {
      if (firstTime.current) {
        const newDecMaxFeePerGas = new BigNumber(
          existingGas.maxFeePerGas,
        ).times(new BigNumber(isCancel ? CANCEL_RATE : SPEED_UP_RATE));
        const newDecMaxPriorityFeePerGas = new BigNumber(
          existingGas.maxPriorityFeePerGas,
        ).times(new BigNumber(isCancel ? CANCEL_RATE : SPEED_UP_RATE));

        //Check to see if default SPEED_UP_RATE/CANCEL_RATE is greater than current market medium value
        if (
          !isMaxFeePerGasMoreThanLegacy(
            new BigNumber(gasFeeEstimates.medium.suggestedMaxPriorityFeePerGas),
          ).result ||
          !isMaxPriorityFeePerGasMoreThanLegacy(
            new BigNumber(gasFeeEstimates.medium.suggestedMaxFeePerGas),
          ).result
        ) {
          updateTx1559Options.current = {
            maxPriortyFeeThreshold: newDecMaxPriorityFeePerGas,
            maxFeeThreshold: newDecMaxFeePerGas,
            showAdvanced: true,
            isCancel,
          };

          onlyDisplayHigh.current = true;
          //Disable polling
          stopUpdateGas.current = true;
          setGasSelected('');
        } else {
          updateTx1559Options.current = {
            maxPriortyFeeThreshold:
              gasFeeEstimates.medium.suggestedMaxPriorityFeePerGas,
            maxFeeThreshold: gasFeeEstimates.medium.suggestedMaxFeePerGas,
            showAdvanced: false,
            isCancel,
          };
          setAnimateOnGasChange(true);
        }
      }

      firstTime.current = false;
    }
  }, [
    existingGas.maxFeePerGas,
    existingGas.maxPriorityFeePerGas,
    gasEstimateType,
    gasFeeEstimates,
    gasSelected,
    isCancel,
    gas,
    suggestedGasLimit,
    isMaxFeePerGasMoreThanLegacy,
    isMaxPriorityFeePerGasMoreThanLegacy,
  ]);

  const update1559TempGasValue = (selected: string) => {
    stopUpdateGas.current = !selected;
    setGasSelected(selected);
  };

  const onSaveTxnWithError = (gasTxn: GasTxnProp) => {
    gasTxn.error = validateAmount(gasTxn);
    onSave(gasTxn);
  };

  const getGasAnalyticsParams = () => ({
    chain_id: chainId,
    gas_estimate_type: gasEstimateType,
    gas_mode: gasSelected ? 'Basic' : 'Advanced',
    speed_set: gasSelected || undefined,
    view: isCancel ? AppConstants.CANCEL_RATE : AppConstants.SPEED_UP_RATE,
  });

  return (
    <EditGasFee1559Update
      selectedGasValue={gasSelected}
      initialSuggestedGasLimit={suggestedGasLimit}
      gasOptions={gasFeeEstimates}
      primaryCurrency={primaryCurrency}
      chainId={chainId}
      onChange={update1559TempGasValue}
      onCancel={onCancel}
      onSave={onSaveTxnWithError}
      ignoreOptions={
        onlyDisplayHigh.current
          ? [AppConstants.GAS_OPTIONS.LOW, AppConstants.GAS_OPTIONS.MEDIUM]
          : [AppConstants.GAS_OPTIONS.LOW]
      }
      updateOption={updateTx1559Options.current}
      analyticsParams={getGasAnalyticsParams()}
      animateOnChange={animateOnGasChange}
      existingGas={existingGas}
    />
  );
};

const mapStateToProps = (state: any) => ({
  accounts: state.engine.backgroundState.AccountTrackerController.accounts,
  selectedAddress:
    state.engine.backgroundState.PreferencesController.selectedAddress,
  ticker: state.engine.backgroundState.NetworkController.provider.ticker,
  gasFeeEstimates:
    state.engine.backgroundState.GasFeeController.gasFeeEstimates,
  gasEstimateType:
    state.engine.backgroundState.GasFeeController.gasEstimateType,
  primaryCurrency: state.settings.primaryCurrency,
  chainId: state.engine.backgroundState.NetworkController.provider.chainId,
});

export default connect(mapStateToProps)(UpdateEIP1559Tx);
