import React, { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { InAppBrowser } from 'react-native-inappbrowser-reborn';
import { Order } from '@consensys/on-ramp-sdk';
import { PaymentCustomAction } from '@consensys/on-ramp-sdk/dist/API';
import CustomActionButtonComponent from '../components/CustomActionButton';
import useAnalytics from '../hooks/useAnalytics';
import { callbackBaseDeeplink, SDK, useFiatOnRampSDK } from '../sdk';
import {
  aggregatorInitialFiatOrder,
  processAggregatorOrder,
} from '../orderProcessor/aggregator';
import { FiatOrder, getNotificationDetails } from '../../FiatOrders';
import { addFiatOrder } from '../../../../reducers/fiatOrders';
import { setLockTime } from '../../../../actions/settings';
import { protectWalletModalVisible } from '../../../../actions/user';
import NotificationManager from '../../../../core/NotificationManager';
import Logger from '../../../../util/Logger';
import { hexToBN } from '../../../../util/number';
import { useNavigation } from '@react-navigation/native';

interface Props {
  customAction: PaymentCustomAction;
  amount: number;
  disabled?: boolean;
}

const CustomActionButton: React.FC<
  Props & React.ComponentProps<typeof CustomActionButtonComponent>
> = ({ customAction, amount, disabled, ...props }: Props) => {
  const dispatch = useDispatch();
  const navigation = useNavigation();
  const trackEvent = useAnalytics();
  const lockTime = useSelector((state: any) => state.settings.lockTime);
  const accounts = useSelector(
    (state: any) =>
      state.engine.backgroundState.AccountTrackerController.accounts,
  );
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Grab the current state of the SDK via the context.
   */
  const {
    selectedAddress,
    selectedPaymentMethodId,
    selectedRegion,
    selectedAsset,
    selectedFiatCurrencyId,
    selectedChainId,
    sdk,
  } = useFiatOnRampSDK();

  /**
   * * Handle custom action
   */

  const handleCustomAction = useCallback(async () => {
    if (!sdk || !customAction) {
      return;
    }
    const prevLockTime = lockTime;
    try {
      setIsLoading(true);
      const providerId = customAction.buy.providerId;
      const redirectUrl = `${callbackBaseDeeplink}on-ramp${providerId}`;
      const provider = await sdk.getProvider(
        selectedRegion?.id as string,
        providerId,
      );

      const {
        url,
        // orderId: customOrderId
      } = await sdk.getBuyUrl(
        provider.provider,
        selectedRegion?.id as string,
        selectedPaymentMethodId as string,
        selectedAsset?.id as string,
        selectedFiatCurrencyId as string,
        amount,
        selectedAddress,
        redirectUrl,
      );

      // TODO: add customOrderId to customOrderIds state.

      if (await InAppBrowser.isAvailable()) {
        dispatch(setLockTime(-1));

        const result = await InAppBrowser.openAuth(url, redirectUrl);

        let orderId;

        if (result.type === 'success' && result.url) {
          const orders = await SDK.orders();
          orderId = await orders.getOrderIdFromCallback(providerId, result.url);
        }

        if (!orderId) {
          return;
        }

        // TODO: remove customOrderId from customOrderIds state.

        const transformedOrder = {
          ...(await processAggregatorOrder(
            aggregatorInitialFiatOrder({
              id: orderId,
              account: selectedAddress,
              network: selectedChainId,
            }),
          )),
          id: orderId,
          account: selectedAddress,
          network: selectedChainId,
        };

        // add the order to the redux global store
        dispatch(addFiatOrder(transformedOrder));

        // prompt user to protect his/her wallet
        dispatch(protectWalletModalVisible());
        // close the checkout webview
        // @ts-expect-error navigation prop mismatch
        navigation.dangerouslyGetParent()?.pop();
        NotificationManager.showSimpleNotification(
          getNotificationDetails(transformedOrder as any),
        );
        trackEvent('ONRAMP_PURCHASE_SUBMITTED', {
          provider_onramp: ((transformedOrder as FiatOrder)?.data as Order)
            ?.provider?.name,
          payment_method_id: ((transformedOrder as FiatOrder)?.data as Order)
            ?.paymentMethod?.id,
          currency_source: ((transformedOrder as FiatOrder)?.data as Order)
            ?.fiatCurrency.symbol,
          currency_destination: ((transformedOrder as FiatOrder)?.data as Order)
            ?.cryptoCurrency.symbol,
          chain_id_destination: selectedChainId,
          is_apple_pay: false,
          has_zero_native_balance: accounts[selectedAddress]?.balance
            ? (hexToBN(accounts[selectedAddress].balance) as any)?.isZero?.()
            : undefined,
        });
      } else {
        Linking.openURL(url);
      }
    } catch (error) {
      Logger.error(error as Error, {
        message:
          'FiatOrders::CustomActionButton error while using custom action browser',
      });
    } finally {
      setIsLoading(false);
      InAppBrowser.closeAuth();
      dispatch(setLockTime(prevLockTime));
    }
  }, [
    sdk,
    customAction,
    lockTime,
    selectedRegion?.id,
    selectedPaymentMethodId,
    selectedAsset?.id,
    selectedFiatCurrencyId,
    amount,
    selectedAddress,
    dispatch,
    selectedChainId,
    navigation,
    trackEvent,
    accounts,
  ]);

  return (
    <CustomActionButtonComponent
      customActionButton={customAction.button}
      onPress={handleCustomAction}
      isLoading={isLoading}
      disabled={disabled || isLoading}
      {...props}
    />
  );
};

export default CustomActionButton;