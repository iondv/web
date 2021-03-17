'use strict';
/**
 * Created by krasilneg on 15.02.17.
 */
const path = require('path');
const express = require('express');
const fs = require('fs');
const favicon = require('serve-favicon');
const { t } = require('@iondv/i18n');
const { format } = require('util');

function resolve(baseDir, pth) {
  let test;
  if (path.isAbsolute(pth)) {
    test = path.normalize(pth);
    if (fs.existsSync(test)) {
      return test;
    }
    return null;
  }
  test = path.normalize(path.join(baseDir, 'view', pth));
  if (fs.existsSync(test)) {
    return test;
  }
  test = path.normalize(path.join(process.cwd(), pth));
  if (fs.existsSync(test)) {
    return test;
  }
  return null;
}

/**
 * @param {{}} app
 * @param {String} urlPath
 * @param {String} baseDir
 * @param {String} themePath
 * @param {Logger} [log]
 * @param {{maxAge: Number}} options
 */
module.exports = function (app, urlPath, baseDir, themePath, log, options) {
  themePath = resolve(baseDir, themePath);
  if (!themePath) {
    throw new Error(format(t('Theme %s not found'), themePath));
  } else {
    if (log) {
      log.info(format(t('Using theme from %s'), themePath));
    }

    const statics = path.join(themePath, 'static');

    if (fs.existsSync(statics)) {
      const vendors = path.join(statics, 'node_modules');
      if (fs.existsSync(vendors)) {
        let pth = urlPath ? '/' + urlPath + '/vendor' : '/vendor';
        app.use(
          urlPath ? '/' + urlPath + '/vendor' : '/vendor',
          express.static(vendors, options)
        );
      }
  
      app.use('/' + (urlPath || ''), express.static(statics, options));
    }    

    let favico = path.join(themePath, 'static', 'favicon.ico');
    if (fs.existsSync(favico)) {
      app.use(favicon(favico));
    }
    let views = [path.join(themePath, 'templates')];
    let current = app.get('views');
    if (typeof current === 'string') {
      views.push(current);
    } else if (Array.isArray(current)) {
      Array.prototype.push.apply(views, current);
    }
    app.set('views', views);
  }
};
module.exports.resolve = resolve;
