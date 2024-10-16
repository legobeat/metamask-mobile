import Logger from '../../../util/Logger';
import AppConstants from '../../AppConstants';
import SDKConnect from '../SDKConnect';
import { waitForCondition } from '../utils/wait.util';
import handleDeeplink from './handleDeeplink';

jest.mock('../SDKConnect');
jest.mock('../../AppConstants');
jest.mock('../utils/DevLogger');
jest.mock('../utils/wait.util');
jest.mock('../../../util/Logger');

describe('handleDeeplink', () => {
  let sdkConnect = {} as unknown as SDKConnect;
  // TODO: Replace "any" with type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fakeConnections = {} as any;

  const mockWaitForCondition = waitForCondition as jest.MockedFunction<
    typeof waitForCondition
  >;

  const channelId = 'channel1';
  const origin = 'testOrigin';
  const url = 'https://example.com';
  const otherPublicKey = 'publicKey';
  const context = 'testContext';
  const protocolVersion = 2;

  const mockHasInitialized = jest.fn();
  const mockGetConnections = jest.fn();
  const mockUpdateSDKLoadingState = jest.fn();
  const mockRevalidateChannel = jest.fn();
  const mockReconnect = jest.fn();
  const mockConnectToChannel = jest.fn();
  const mockDecrypt = jest
    .fn()
    .mockReturnValue('{"jsonrpc":"2.0","method":"eth_accounts"}');
  const mockGetConnected = jest.fn().mockReturnValue({
    [channelId]: {
      remote: {
        decrypt: mockDecrypt,
      },
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateSDKLoadingState.mockResolvedValue(undefined);
    fakeConnections = [
      {
        channelId,
        origin,
        url,
        otherPublicKey,
        context,
      },
    ];

    sdkConnect = {
      hasInitialized: mockHasInitialized,
      getConnections: mockGetConnections,
      updateSDKLoadingState: mockUpdateSDKLoadingState,
      revalidateChannel: mockRevalidateChannel,
      reconnect: mockReconnect,
      connectToChannel: mockConnectToChannel,
      getConnected: mockGetConnected,
    } as unknown as SDKConnect;

    mockGetConnections.mockReturnValue(fakeConnections);
  });

  it('should waits for SDKConnect to initialize if not already initialized', async () => {
    mockHasInitialized.mockReturnValueOnce(false).mockReturnValueOnce(true);
    mockWaitForCondition.mockResolvedValue();

    await handleDeeplink({
      sdkConnect,
      channelId,
      origin,
      url,
      otherPublicKey,
      protocolVersion,
      context,
    });

    expect(waitForCondition).toHaveBeenCalledWith(expect.any(Object));
    expect(sdkConnect.hasInitialized).toHaveBeenCalledTimes(1);
  });

  it('should handles deeplink origin and modifies origin if url contains QR code parameter', async () => {
    const modifiedOrigin = AppConstants.DEEPLINKS.ORIGIN_QR_CODE;
    const modifiedUrl = `${url}&t=q`;

    await handleDeeplink({
      sdkConnect,
      channelId,
      origin: AppConstants.DEEPLINKS.ORIGIN_DEEPLINK,
      url: modifiedUrl,
      protocolVersion,
      otherPublicKey,
      context,
    });

    expect(sdkConnect.connectToChannel).toHaveBeenCalledWith({
      id: channelId,
      initialConnection: true,
      origin: modifiedOrigin,
      originatorInfo: undefined,
      protocolVersion,
      trigger: 'deeplink',
      otherPublicKey,
    });
  });

  it('should reconnects to an existing channel', async () => {
    mockHasInitialized.mockReturnValue(true);
    mockGetConnections.mockReturnValue({ [channelId]: {} });

    await handleDeeplink({
      sdkConnect,
      channelId,
      origin,
      url,
      otherPublicKey,
      protocolVersion,
      context,
    });

    expect(sdkConnect.reconnect).toHaveBeenCalledWith({
      channelId,
      otherPublicKey,
      context,
      protocolVersion,
      initialConnection: false,
      trigger: 'deeplink',
      updateKey: true,
    });
  });

  it('should connects to a new channel if it does not exist', async () => {
    mockHasInitialized.mockReturnValue(true);
    mockGetConnections.mockReturnValue({});

    await handleDeeplink({
      sdkConnect,
      channelId,
      origin,
      url,
      protocolVersion,
      otherPublicKey,
      context,
    });

    expect(sdkConnect.connectToChannel).toHaveBeenCalledWith({
      id: channelId,
      initialConnection: true,
      origin,
      originatorInfo: undefined,
      protocolVersion,
      trigger: 'deeplink',
      otherPublicKey,
    });
  });

  it('should logs and continues on error during connection', async () => {
    const error = new Error('test error');
    mockHasInitialized.mockReturnValue(true);
    mockConnectToChannel.mockRejectedValue(error);

    await handleDeeplink({
      sdkConnect,
      channelId,
      origin,
      protocolVersion,
      url,
      otherPublicKey,
      context,
    });

    expect(Logger.error).toHaveBeenCalledWith(
      error,
      'Failed to connect to channel',
    );
  });

  it('should handle rpc calls when rpc has values and connection is valid', async () => {
    const rpc = Buffer.from(
      '{"jsonrpc":"2.0","method":"eth_accounts"}',
    ).toString('base64');
    const decodedRPC = '{"jsonrpc":"2.0","method":"eth_accounts"}';

    (sdkConnect.getConnections as jest.Mock).mockReturnValue({
      [channelId]: {},
    });

    await handleDeeplink({
      sdkConnect: sdkConnect as SDKConnect,
      channelId,
      origin,
      url,
      otherPublicKey,
      protocolVersion,
      context,
      rpc,
    });

    expect(mockGetConnected()[channelId].remote.decrypt).toHaveBeenCalledWith(
      decodedRPC,
    );
  });

  it('should not handle rpc calls when rpc has values and connection is not found', async () => {
    const rpc = Buffer.from(
      '{"jsonrpc":"2.0","method":"eth_accounts"}',
    ).toString('base64');
    (sdkConnect.getConnections as jest.Mock).mockReturnValue({
      [channelId]: undefined,
    });

    await handleDeeplink({
      sdkConnect: sdkConnect as SDKConnect,
      channelId,
      origin,
      url,
      otherPublicKey,
      protocolVersion,
      context,
      rpc,
    });

    expect(mockGetConnected()[channelId].remote.decrypt).not.toHaveBeenCalled();
  });
});
