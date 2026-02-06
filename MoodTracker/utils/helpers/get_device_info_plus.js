/** @about getDeviceInfoPlus() simple version @min_zeppos 2.0 */
import { getDeviceInfo } from '@zos/device';

export function getDeviceInfoPlus() {
  const info = getDeviceInfo();
  return {
    name: 'Device',
    width: info.width || 416,
    height: info.height || 416,
    shape: 'R',
    ...info
  };
}
