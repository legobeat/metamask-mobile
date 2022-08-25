import React, { useCallback, useRef } from 'react';
import { View, Image, Linking, Platform } from 'react-native';
import { createStyles } from './styles';
import { strings } from '../../../../locales/i18n';
import Text, {
  TextVariant,
} from '../../../component-library/components/Texts/Text';
import { createNavigationDetails } from '../../../util/navigation/navUtils';
import Routes from '../../../constants/navigation/Routes';
import { useTheme } from '../../../util/theme';
import ReusableModal, { ReusableModalRef } from '../ReusableModal';
import Logger from '../../../util/Logger';
import ButtonTertiary, {
  ButtonTertiaryVariant,
} from '../../../component-library/components/Buttons/ButtonTertiary';
import { ButtonBaseSize } from '../../../component-library/components/Buttons/ButtonBase';
import ButtonPrimary from '../../../component-library/components/Buttons/ButtonPrimary';
import { MM_APP_STORE_LINK, MM_PLAY_STORE_LINK } from '../../../constants/urls';

/* eslint-disable import/no-commonjs, @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports */
const onboardingDeviceImage = require('../../../images/swaps_onboard_device.png');

export const createUpdateNeededNavDetails = createNavigationDetails(
  Routes.MODAL.ROOT_MODAL_FLOW,
  Routes.MODAL.UPDATE_NEEDED,
);

const UpdateNeeded = () => {
  const { colors } = useTheme();
  const styles = createStyles(colors);
  const modalRef = useRef<ReusableModalRef | null>(null);

  const dismissModal = (cb?: () => void): void =>
    modalRef?.current?.dismissModal(cb);

  const triggerClose = () => dismissModal();

  const openAppStore = useCallback(() => {
    const link = Platform.OS === 'ios' ? MM_APP_STORE_LINK : MM_PLAY_STORE_LINK;
    Linking.canOpenURL(link).then(
      (supported) => {
        supported && Linking.openURL(link);
      },
      (err) => Logger.error(err, 'Unable to perform update'),
    );
  }, []);

  const onUpdatePressed = useCallback(() => {
    dismissModal(openAppStore);
  }, [openAppStore]);

  return (
    <ReusableModal ref={modalRef} style={styles.screen}>
      <View style={styles.content}>
        <View style={styles.images}>
          <Image source={onboardingDeviceImage} />
        </View>
        <Text variant={TextVariant.lHeadingLG} style={styles.title}>
          {strings('update_needed.title')}
        </Text>
        <Text variant={TextVariant.sBodyMD} style={styles.description}>
          {strings('update_needed.description')}
        </Text>
      </View>
      <View style={styles.actionButtonWrapper}>
        <ButtonPrimary
          label={strings('update_needed.primary_action')}
          onPress={onUpdatePressed}
          style={styles.actionButton}
        />
        <ButtonTertiary
          label={strings('update_needed.secondary_action')}
          size={ButtonBaseSize.Md}
          onPress={triggerClose}
          variant={ButtonTertiaryVariant.Normal}
        />
      </View>
    </ReusableModal>
  );
};

export default React.memo(UpdateNeeded);
