/**
 * Created by krasilneg on 08.05.17.
 */
'use strict';

const { IonError } = require('@iondv/core');

const PREFIX = 'front-end';

const errors = module.exports = {
  ACCESS_DENIED: `${PREFIX}.403`
};

IonError.registerMessages(errors);
