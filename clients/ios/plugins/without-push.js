// T-Max solo usa notificaciones locales (las programa el propio iPad). Quita el permiso de push
// que agrega expo-notifications: no hay servidor de push y complicaría la firma con Flarestore.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withoutPush(config) {
  if (config.ios && config.ios.entitlements) delete config.ios.entitlements['aps-environment'];
  return withEntitlementsPlist(config, (c) => {
    delete c.modResults['aps-environment'];
    return c;
  });
};
