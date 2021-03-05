/**
 * Created by krasilneg on 08.05.17.
 */
'use strict';

const { IonError } = require('@iondv/core');
const { w: t } = require('@iondv/i18n');

const PREFIX = 'front-end';

const codes = module.exports = {
  ACCESS_DENIED: `${PREFIX}.403`
};

IonError.registerMessages({
  [codes.ACCESS_DENIED]: t(`Access level not enough for the action.`)
});
