const express = require('express');
const resolvePath = require('@iondv/core').utils.system.toAbsolute;

/**
 *
 * @param {{name: String, path: String}[]}statics
 * @param {{maxAge: Number}[]}options
 * @return {*}
 */
module.exports = function (statics, options) {
  var router = express.Router();
  var result = null;
  if (statics) {
    for (var name in statics) {
      if (statics.hasOwnProperty(name)) {
        router.use(
          (name[0] === '/' ? '' : '/') + name,
          express.static(resolvePath(statics[name]), options)
        );
        if (!result) {
          result = router;
        }
      }
    }
  }
  return result;
};
