import React, { PureComponent } from 'react';
import {
  StyleSheet,
  Alert,
  InteractionManager,
  AppState,
  View,
} from 'react-native';
import PropTypes from 'prop-types';
import { getApproveNavbar } from '../../../UI/Navbar';
import { connect } from 'react-redux';
import { safeToChecksumAddress } from '../../../../util/address';
import Engine from '../../../../core/Engine';
import AnimatedTransactionModal from '../../../UI/AnimatedTransactionModal';
import ApproveTransactionReview from '../../../UI/ApproveTransactionReview';
import AddNickname from '../../../UI/ApproveTransactionReview/AddNickname';
import Modal from 'react-native-modal';
import { strings } from '../../../../../locales/i18n';
import { setTransactionObject } from '../../../../actions/transaction';
import { GAS_ESTIMATE_TYPES, util } from '@metamask/controllers';
import { addHexPrefix, fromWei, renderFromWei } from '../../../../util/number';
import {
  getNormalizedTxState,
  getTicker,
  parseTransactionEIP1559,
  parseTransactionLegacy,
} from '../../../../util/transactions';
import { getGasLimit } from '../../../../util/custom-gas';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import NotificationManager from '../../../../core/NotificationManager';
import Analytics from '../../../../core/Analytics/Analytics';
import { ANALYTICS_EVENT_OPTS } from '../../../../util/analytics';
import Logger from '../../../../util/Logger';
import AnalyticsV2 from '../../../../util/analyticsV2';
import EditGasFee1559Update from '../../../UI/EditGasFee1559Update';
import EditGasFeeLegacy from '../../../UI/EditGasFeeLegacy';
import AppConstants from '../../../../core/AppConstants';
import { shallowEqual } from '../../../../util/general';
import { KEYSTONE_TX_CANCELED } from '../../../../constants/error';
import GlobalAlert from '../../../UI/GlobalAlert';
import checkIfAddressIsSaved from '../../../../util/checkAddress';
import { ThemeContext, mockTheme } from '../../../../util/theme';
import {
  startGasPolling,
  stopGasPolling,
} from '../../../../core/GasPolling/GasPolling';

const { BNToHex, hexToBN } = util;

const EDIT = 'edit';
const REVIEW = 'review';

const styles = StyleSheet.create({
  keyboardAwareWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bottomModal: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  updateNickView: {
    margin: 0,
  },
});

/**
 * PureComponent that manages ERC20 approve from the dapp browser
 */
class Approve extends PureComponent {
  static navigationOptions = ({ navigation }) =>
    getApproveNavbar('approve.title', navigation);

  static propTypes = {
    /**
     * List of accounts from the AccountTrackerController
     */
    accounts: PropTypes.object,
    /**
     * Transaction state
     */
    transaction: PropTypes.object.isRequired,
    /**
     * Action that sets transaction attributes from object to a transaction
     */
    setTransactionObject: PropTypes.func.isRequired,
    /**
     * List of transactions
     */
    transactions: PropTypes.array,
    /**
     * Number of tokens
     */
    tokensLength: PropTypes.number,
    /**
     * Number of accounts
     */
    accountsLength: PropTypes.number,
    /**
     * A string representing the network name
     */
    providerType: PropTypes.string,
    /**
     * Whether the modal is visible
     */
    modalVisible: PropTypes.bool,
    /**
    /* Token approve modal visible or not
    */
    toggleApproveModal: PropTypes.func,
    /**
     * Current selected ticker
     */
    ticker: PropTypes.string,
    /**
     * Gas fee estimates returned by the gas fee controller
     */
    gasFeeEstimates: PropTypes.object,
    /**
     * Estimate type returned by the gas fee controller, can be market-fee, legacy or eth_gasPrice
     */
    gasEstimateType: PropTypes.string,
    /**
     * ETH or fiat, depending on user setting
     */
    primaryCurrency: PropTypes.string,
    /**
     * A string representing the network chainId
     */
    chainId: PropTypes.string,
    /**
     * A string representing the network type
     */
    networkType: PropTypes.string,
    /**
     * An object of all saved addresses
     */
    addressBook: PropTypes.object,
    /**
     * The current network of the app
     */
    network: PropTypes.string,
  };

  state = {
    approved: false,
    gasError: undefined,
    ready: false,
    mode: REVIEW,
    over: false,
    analyticsParams: {},
    gasSelected: AppConstants.GAS_OPTIONS.MEDIUM,
    gasSelectedTemp: AppConstants.GAS_OPTIONS.MEDIUM,
    LegacyGasData: {},
    LegacyGasDataTemp: {},
    transactionConfirmed: false,
    addNickname: false,
    suggestedGasLimit: undefined,
    gasTransaction: {},
    gasPriceObject: {},
  };

  computeGasEstimates = (
    overrideGasPrice,
    overrideGasLimit,
    gasEstimateTypeChanged,
  ) => {
    const { transaction, gasEstimateType, gasFeeEstimates } = this.props;

    const gasSelected = gasEstimateTypeChanged
      ? AppConstants.GAS_OPTIONS.MEDIUM
      : this.state.gasSelected;
    const gasSelectedTemp = gasEstimateTypeChanged
      ? AppConstants.GAS_OPTIONS.MEDIUM
      : this.state.gasSelectedTemp;

    if (gasEstimateType === GAS_ESTIMATE_TYPES.FEE_MARKET) {
      const suggestedGasLimit = fromWei(
        overrideGasLimit || transaction.gas,
        'wei',
      );

      // eslint-disable-next-line react/no-did-update-set-state
      this.setState(
        {
          ready: true,
          LegacyGasData: {},
          LegacyGasDataTemp: {},
          animateOnChange: true,
          gasSelected,
          gasSelectedTemp,
          suggestedGasLimit,
        },
        () => {
          this.setState({ animateOnChange: false });
        },
      );
    } else {
      const suggestedGasLimit = fromWei(
        overrideGasLimit || transaction.gas,
        'wei',
      );

      const getGas = (selected) =>
        overrideGasPrice
          ? fromWei(overrideGasPrice, 'gwei')
          : gasEstimateType === GAS_ESTIMATE_TYPES.LEGACY
          ? gasFeeEstimates[selected]
          : gasFeeEstimates.gasPrice;

      const LegacyGasData = this.parseTransactionDataLegacy(
        {
          suggestedGasPrice: getGas(gasSelected),
          suggestedGasLimit,
        },
        { onlyGas: true },
      );

      let LegacyGasDataTemp;
      if (gasSelected === gasSelectedTemp) {
        LegacyGasDataTemp = LegacyGasData;
      } else {
        LegacyGasDataTemp = this.parseTransactionDataLegacy(
          {
            suggestedGasPrice: getGas(gasSelectedTemp),
            suggestedGasLimit,
          },
          { onlyGas: true },
        );
      }

      // eslint-disable-next-line react/no-did-update-set-state
      this.setState(
        {
          ready: true,
          LegacyGasData,
          LegacyGasDataTemp,
          animateOnChange: true,
          gasSelected,
          gasSelectedTemp,
          suggestedGasLimit,
        },
        () => {
          this.setState({ animateOnChange: false });
        },
      );
    }
  };

  onUpdateContractNickname = () => {
    this.setState({ addNickname: !this.state.addNickname });
  };

  startPolling = async () => {
    const pollToken = await startGasPolling(this.state.pollToken);
    this.setState({ pollToken });
  };

  componentDidMount = () => {
    if (!this.props?.transaction?.id) {
      this.props.toggleApproveModal(false);
      return null;
    }
    if (!this.props?.transaction?.gas) this.handleGetGasLimit();

    this.startPolling();

    AppState.addEventListener('change', this.handleAppStateChange);
  };

  handleGetGasLimit = async () => {
    const { setTransactionObject, transaction } = this.props;
    const estimation = await getGasLimit({ ...transaction, gas: undefined });
    setTransactionObject({ gas: estimation.gas });
  };

  componentDidUpdate = (prevProps) => {
    const { transaction } = this.props;

    const gasEstimateTypeChanged =
      prevProps.gasEstimateType !== this.props.gasEstimateType;

    if (
      (!this.state.stopUpdateGas && !this.state.advancedGasInserted) ||
      gasEstimateTypeChanged
    ) {
      if (
        this.props.gasFeeEstimates &&
        transaction.gas &&
        (!shallowEqual(prevProps.gasFeeEstimates, this.props.gasFeeEstimates) ||
          !transaction.gas.eq(prevProps?.transaction?.gas))
      ) {
        this.computeGasEstimates(null, null, gasEstimateTypeChanged);
      }
    }
  };

  parseTransactionDataEIP1559 = (gasFee, options) => {
    const parsedTransactionEIP1559 = parseTransactionEIP1559(
      {
        ...this.props,
        selectedGasFee: {
          ...gasFee,
          estimatedBaseFee: this.props.gasFeeEstimates.estimatedBaseFee,
        },
      },
      { onlyGas: true },
    );

    parsedTransactionEIP1559.error = this.validateGas(
      parsedTransactionEIP1559.totalMaxHex,
    );
    return parsedTransactionEIP1559;
  };

  parseTransactionDataLegacy = (gasFee, options) => {
    const parsedTransactionLegacy = parseTransactionLegacy(
      {
        ...this.props,
        selectedGasFee: gasFee,
      },
      { onlyGas: true },
    );
    parsedTransactionLegacy.error = this.validateGas(
      parsedTransactionLegacy.totalHex,
    );
    return parsedTransactionLegacy;
  };

  componentWillUnmount = async () => {
    const { approved } = this.state;
    const { transaction } = this.props;

    await stopGasPolling(this.state.pollToken);
    AppState.removeEventListener('change', this.handleAppStateChange);
    Engine.context.TransactionController.hub.removeAllListeners(
      `${transaction.id}:finished`,
    );
    if (!approved)
      Engine.context.TransactionController.cancelTransaction(transaction.id);
  };

  handleAppStateChange = (appState) => {
    if (appState !== 'active') {
      const { transaction } = this.props;
      transaction &&
        transaction.id &&
        Engine.context.TransactionController.cancelTransaction(transaction.id);
      this.props.toggleApproveModal(false);
    }
  };

  trackApproveEvent = (event) => {
    const { transaction, tokensLength, accountsLength, providerType } =
      this.props;
    InteractionManager.runAfterInteractions(() => {
      Analytics.trackEventWithParameters(event, {
        view: transaction.origin,
        numberOfTokens: tokensLength,
        numberOfAccounts: accountsLength,
        network: providerType,
      });
    });
  };

  cancelGasEdition = () => {
    this.setState({
      LegacyGasDataTemp: { ...this.state.LegacyGasData },
      stopUpdateGas: false,
      gasSelectedTemp: this.state.gasSelected,
    });
    this.review();
  };

  cancelGasEditionUpdate = () => {
    this.setState({
      LegacyGasDataTemp: { ...this.state.LegacyGasData },
      stopUpdateGas: false,
      gasSelectedTemp: this.state.gasSelected,
    });
    this.review();
  };

  saveGasEdition = (gasSelected) => {
    this.setState({
      LegacyGasData: { ...this.state.LegacyGasDataTemp },
      gasSelected,
      gasSelectedTemp: gasSelected,
      advancedGasInserted: !gasSelected,
      stopUpdateGas: false,
    });
    this.review();
  };

  saveGasEditionUpdate = (gasTransaction, gasPriceObject) => {
    this.setState({ gasTransaction, gasPriceObject });
    this.review();
  };

  validateGas = (total) => {
    let error;
    const {
      ticker,
      transaction: { from },
      accounts,
    } = this.props;

    const fromAccount = accounts[safeToChecksumAddress(from)];

    const weiBalance = hexToBN(fromAccount.balance);
    const totalTransactionValue = hexToBN(total);
    if (!weiBalance.gte(totalTransactionValue)) {
      const amount = renderFromWei(totalTransactionValue.sub(weiBalance));
      const tokenSymbol = getTicker(ticker);
      error = strings('transaction.insufficient_amount', {
        amount,
        tokenSymbol,
      });
    }

    return error;
  };

  prepareTransaction = (transaction) => {
    const { gasEstimateType } = this.props;
    const { LegacyGasData, gasTransaction } = this.state;
    const transactionToSend = {
      ...transaction,
      value: BNToHex(transaction.value),
      to: safeToChecksumAddress(transaction.to),
      from: safeToChecksumAddress(transaction.from),
    };

    if (gasEstimateType === GAS_ESTIMATE_TYPES.FEE_MARKET) {
      transactionToSend.gas = gasTransaction.gasLimitHex;
      transactionToSend.maxFeePerGas = addHexPrefix(
        gasTransaction.suggestedMaxFeePerGasHex,
      ); //'0x2540be400'
      transactionToSend.maxPriorityFeePerGas = addHexPrefix(
        gasTransaction.suggestedMaxPriorityFeePerGasHex,
      ); //'0x3b9aca00';
      delete transactionToSend.gasPrice;
    } else {
      transactionToSend.gas = LegacyGasData.suggestedGasLimitHex;
      transactionToSend.gasPrice = addHexPrefix(
        LegacyGasData.suggestedGasPriceHex,
      );
    }

    return transactionToSend;
  };

  getAnalyticsParams = () => {
    try {
      const { gasEstimateType } = this.props;
      const { analyticsParams, gasSelected } = this.state;
      return {
        ...analyticsParams,
        gas_estimate_type: gasEstimateType,
        gas_mode: gasSelected ? 'Basic' : 'Advanced',
        speed_set: gasSelected || undefined,
      };
    } catch (error) {
      return {};
    }
  };

  onConfirm = async () => {
    const { TransactionController, KeyringController } = Engine.context;
    const { transactions, gasEstimateType } = this.props;
    const { LegacyGasData, transactionConfirmed, gasTransaction } = this.state;

    if (gasEstimateType === GAS_ESTIMATE_TYPES.FEE_MARKET) {
      if (this.validateGas(gasTransaction.totalMaxHex)) return;
    } else if (this.validateGas(LegacyGasData.totalHex)) return;
    if (transactionConfirmed) return;
    this.setState({ transactionConfirmed: true });
    try {
      const transaction = this.prepareTransaction(this.props.transaction);
      TransactionController.hub.once(
        `${transaction.id}:finished`,
        (transactionMeta) => {
          if (transactionMeta.status === 'submitted') {
            this.setState({ approved: true });
            this.props.toggleApproveModal();
            NotificationManager.watchSubmittedTransaction({
              ...transactionMeta,
              assetType: 'ETH',
            });
          } else {
            throw transactionMeta.error;
          }
        },
      );

      const fullTx = transactions.find(({ id }) => id === transaction.id);
      const updatedTx = { ...fullTx, transaction };
      await TransactionController.updateTransaction(updatedTx);
      await KeyringController.resetQRKeyringState();
      await TransactionController.approveTransaction(transaction.id);
      AnalyticsV2.trackEvent(
        AnalyticsV2.ANALYTICS_EVENTS.APPROVAL_COMPLETED,
        this.getAnalyticsParams(),
      );
    } catch (error) {
      if (!error?.message.startsWith(KEYSTONE_TX_CANCELED)) {
        Alert.alert(
          strings('transactions.transaction_error'),
          error && error.message,
          [{ text: 'OK' }],
        );
        Logger.error(error, 'error while trying to send transaction (Approve)');
      } else {
        AnalyticsV2.trackEvent(
          AnalyticsV2.ANALYTICS_EVENTS.QR_HARDWARE_TRANSACTION_CANCELED,
        );
      }
      this.setState({ transactionHandled: false });
    }
    this.setState({ transactionConfirmed: true });
  };

  onCancel = () => {
    AnalyticsV2.trackEvent(
      AnalyticsV2.ANALYTICS_EVENTS.APPROVAL_CANCELLED,
      this.getAnalyticsParams(),
    );
    this.props.toggleApproveModal(false);
  };

  review = () => {
    this.onModeChange(REVIEW);
  };

  onModeChange = (mode) => {
    this.setState({ mode });
    if (mode === EDIT) {
      InteractionManager.runAfterInteractions(() => {
        Analytics.trackEvent(
          ANALYTICS_EVENT_OPTS.SEND_FLOW_ADJUSTS_TRANSACTION_FEE,
        );
      });
    }
  };

  setAnalyticsParams = (analyticsParams) => {
    this.setState({ analyticsParams });
  };

  getGasAnalyticsParams = () => {
    try {
      const { analyticsParams } = this.state;
      const { gasEstimateType, networkType } = this.props;
      return {
        dapp_host_name: analyticsParams?.dapp_host_name,
        dapp_url: analyticsParams?.dapp_url,
        active_currency: {
          value: analyticsParams?.active_currency,
          anonymous: true,
        },
        gas_estimate_type: gasEstimateType,
        network_name: networkType,
      };
    } catch (error) {
      return {};
    }
  };

  updateGasSelected = (selected) => {
    this.setState({
      stopUpdateGas: !selected,
      gasSelectedTemp: selected,
      gasSelected: selected,
    });
  };

  calculateTempGasFeeLegacy = (gas, selected) => {
    const { transaction } = this.props;
    if (selected && gas) {
      gas.suggestedGasLimit = fromWei(transaction.gas, 'wei');
    }
    this.setState({
      LegacyGasDataTemp: this.parseTransactionDataLegacy(gas),
      stopUpdateGas: !selected,
      gasSelectedTemp: selected,
    });
  };

  onUpdatingValuesStart = () => {
    this.setState({ isAnimating: true });
  };
  onUpdatingValuesEnd = () => {
    this.setState({ isAnimating: false });
  };

  render = () => {
    const {
      mode,
      ready,
      over,
      LegacyGasData,
      LegacyGasDataTemp,
      gasSelected,
      animateOnChange,
      isAnimating,
      transactionConfirmed,
      gasPriceObject,
      gasTransaction,
    } = this.state;

    const {
      transaction,
      addressBook,
      network,
      gasEstimateType,
      gasFeeEstimates,
      primaryCurrency,
      chainId,
    } = this.props;

    const currentGasPriceObject = {
      suggestedMaxFeePerGas:
        gasPriceObject.suggestedMaxFeePerGas ||
        gasFeeEstimates[gasSelected]?.suggestedMaxFeePerGas,
      suggestedMaxPriorityFeePerGas:
        gasPriceObject.suggestedMaxPriorityFeePerGas ||
        gasFeeEstimates[gasSelected]?.suggestedMaxPriorityFeePerGas,
    };

    const colors = this.context.colors || mockTheme.colors;

    const addressData = checkIfAddressIsSaved(
      addressBook,
      network,
      transaction,
    );

    if (!transaction.id) return null;
    return (
      <Modal
        isVisible={this.props.modalVisible}
        animationIn="slideInUp"
        animationOut="slideOutDown"
        style={
          this.state.addNickname ? styles.updateNickView : styles.bottomModal
        }
        backdropColor={colors.overlay.default}
        backdropOpacity={1}
        animationInTiming={600}
        animationOutTiming={600}
        onBackdropPress={this.onCancel}
        onBackButtonPress={this.onCancel}
        onSwipeComplete={this.onCancel}
        swipeDirection={'down'}
        propagateSwipe
      >
        {this.state.addNickname ? (
          <AddNickname
            onUpdateContractNickname={this.onUpdateContractNickname}
            contractAddress={transaction.to}
            nicknameExists={addressData && !!addressData.length}
            nickname={
              addressData && addressData.length > 0
                ? addressData[0].nickname
                : ''
            }
          />
        ) : (
          <KeyboardAwareScrollView
            contentContainerStyle={styles.keyboardAwareWrapper}
          >
            {mode === 'review' && (
              <AnimatedTransactionModal
                onModeChange={this.onModeChange}
                ready={ready}
                review={this.review}
              >
                <ApproveTransactionReview
                  gasError={gasTransaction.error || LegacyGasData.error}
                  onCancel={this.onCancel}
                  onConfirm={this.onConfirm}
                  over={over}
                  gasSelected={gasSelected}
                  onSetAnalyticsParams={this.setAnalyticsParams}
                  LegacyGasData={LegacyGasData}
                  gasEstimateType={gasEstimateType}
                  onUpdatingValuesStart={this.onUpdatingValuesStart}
                  onUpdatingValuesEnd={this.onUpdatingValuesEnd}
                  animateOnChange={animateOnChange}
                  isAnimating={isAnimating}
                  gasEstimationReady={ready}
                  transactionConfirmed={transactionConfirmed}
                  onUpdateContractNickname={this.onUpdateContractNickname}
                  nicknameExists={addressData && !!addressData.length}
                  nickname={
                    addressData && addressData.length > 0
                      ? addressData[0].nickname
                      : ''
                  }
                  chainId={chainId}
                  gasPriceObject={this.state.gasPriceObject}
                />
                {/** View fixes layout issue after removing <CustomGas/> */}
                <View />
              </AnimatedTransactionModal>
            )}

            {mode !== 'review' &&
              (gasEstimateType === GAS_ESTIMATE_TYPES.FEE_MARKET ? (
                <EditGasFee1559Update
                  selectedGasValue={gasSelected}
                  initialSuggestedGasLimit={this.state.suggestedGasLimit}
                  onChange={this.updateGasSelected}
                  primaryCurrency={primaryCurrency}
                  chainId={chainId}
                  onCancel={this.cancelGasEdition}
                  onSave={this.saveGasEditionUpdate}
                  nUpdatingValuesStart={this.onUpdatingValuesStart}
                  onUpdatingValuesEnd={this.onUpdatingValuesEnd}
                  animateOnChange={animateOnChange}
                  isAnimating={isAnimating}
                  view={'Approve'}
                  analyticsParams={this.getGasAnalyticsParams()}
                  onlyGas
                  gasOptions={gasFeeEstimates}
                  currentGasPriceObject={currentGasPriceObject}
                />
              ) : (
                <EditGasFeeLegacy
                  selected={gasSelected}
                  gasFee={LegacyGasDataTemp}
                  gasEstimateType={gasEstimateType}
                  gasOptions={gasFeeEstimates}
                  onChange={this.calculateTempGasFeeLegacy}
                  gasFeeNative={LegacyGasDataTemp.transactionFee}
                  gasFeeConversion={LegacyGasDataTemp.transactionFeeFiat}
                  gasPriceConversion={LegacyGasDataTemp.transactionFeeFiat}
                  primaryCurrency={primaryCurrency}
                  chainId={chainId}
                  onCancel={this.cancelGasEdition}
                  onSave={this.saveGasEdition}
                  error={LegacyGasDataTemp.error}
                  onUpdatingValuesStart={this.onUpdatingValuesStart}
                  onUpdatingValuesEnd={this.onUpdatingValuesEnd}
                  animateOnChange={animateOnChange}
                  isAnimating={isAnimating}
                  view={'Approve'}
                  analyticsParams={this.getGasAnalyticsParams()}
                />
              ))}
          </KeyboardAwareScrollView>
        )}
        <GlobalAlert />
      </Modal>
    );
  };
}

const mapStateToProps = (state) => ({
  accounts: state.engine.backgroundState.AccountTrackerController.accounts,
  ticker: state.engine.backgroundState.NetworkController.provider.ticker,
  transaction: getNormalizedTxState(state),
  transactions: state.engine.backgroundState.TransactionController.transactions,
  accountsLength: Object.keys(
    state.engine.backgroundState.AccountTrackerController.accounts || {},
  ).length,
  tokensLength: state.engine.backgroundState.TokensController.tokens.length,
  primaryCurrency: state.settings.primaryCurrency,
  chainId: state.engine.backgroundState.NetworkController.provider.chainId,
  gasFeeEstimates:
    state.engine.backgroundState.GasFeeController.gasFeeEstimates,
  gasEstimateType:
    state.engine.backgroundState.GasFeeController.gasEstimateType,
  currentCurrency:
    state.engine.backgroundState.CurrencyRateController.currentCurrency,
  nativeCurrency:
    state.engine.backgroundState.CurrencyRateController.nativeCurrency,
  conversionRate:
    state.engine.backgroundState.CurrencyRateController.conversionRate,
  networkType: state.engine.backgroundState.NetworkController.provider.type,
  addressBook: state.engine.backgroundState.AddressBookController.addressBook,
  network: state.engine.backgroundState.NetworkController.network,
});

const mapDispatchToProps = (dispatch) => ({
  setTransactionObject: (transaction) =>
    dispatch(setTransactionObject(transaction)),
});

Approve.contextType = ThemeContext;

export default connect(mapStateToProps, mapDispatchToProps)(Approve);
