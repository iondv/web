/**
 * Created by krasilneg on 22.08.18.
 */
/* eslint no-process-exit:off, no-sync:off */
'use strict';

const path = require('path');
const http = require('http');
const https = require('https');
const express = require('express');
const ejsLocals = require('ejs-locals');
const flash = require('connect-flash');
const fs = require('fs');

const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const FileStreamRotator = require('file-stream-rotator');
const morgan = require('morgan');
const extend = require('extend');
const locale = require('locale');
const { format } = require('util');

const { di } = require('@iondv/core');
const { SettingsRepository } = require('@iondv/commons-contracts');
const { load, lang, t, supported } = require('@iondv/i18n');
const { utils: { strings }, di: { alias } } = require('@iondv/core');
const theme = require('./util/theme');

module.exports = (
  { config, sysLog, onScope, onStart, modules, dispatcher, baseDir }
) => {
  const rootPath = baseDir || process.cwd();
  lang(config.lang);

  strings.registerBase('frontend', require('./strings/frontend'));
  strings.registerBase('tpl', require('./strings/templates-default'));

  const app = express();

  app.engine('ejs', ejsLocals);
  app.set('view engine', 'ejs');  

  global.app = app;

  if (process.env.NODE_ENV !== 'development') {
    const logDirectory = path.join(rootPath, 'log');
    if (!fs.existsSync(logDirectory)) {
      fs.mkdirSync(logDirectory);
    }
    const accessLogStream = FileStreamRotator.getStream({
      filename: path.join(logDirectory, '/access-%DATE%.log'),
      frequency: 'daily',
      verbose: false,
      date_format: 'YYYY-MM-DD'
    });
    app.use(morgan('combined', {stream: accessLogStream}));
  } else {
    app.use(morgan('dev'));
  }

  app.use(flash());

  app.use(methodOverride('X-HTTP-Method'));       // Microsoft
  app.use(methodOverride('X-HTTP-Method-Override')); // Google/GData
  app.use(methodOverride('X-Method-Override'));      // IBM

  const limit = config.requestSizeLimit || '1mb';
  app.use(bodyParser.text({type: 'text/*', limit}));
  app.use(bodyParser.json({type: 'application/json', limit}));
  app.use(bodyParser.urlencoded({extended: true, limit}));
  app.use(bodyParser.raw({limit}));

  app.use((req, res, next) => {
    const locales = new locale.Locales(req.headers['accept-language']);
    app.locals.supportedLanguages = supported();
    let lang;
    for (let i = 0; i < locales.length; i++) {
      if (app.locals.supportedLanguages.includes(locales[i].language)) {
        lang = locales[i].language;
        break;
      }
    }
    req.locals = {};
    app.locals.lang = res.locals.lang = req.locals.lang = lang;
    app.locals.__ = res.locals.__ = req.locals.__ = (str, params) => strings.s('tpl', str, params, lang);
    app.locals.t = res.locals.t = req.locals.t = (str, ...args) => t(str, ...args, {lang: req.locals.lang});
    next();
  });

  app.locals.s = strings.s;
  app.locals.baseUrl = config.baseUrl || '/';
  if (!app.locals.baseUrl.endsWith('/')) {
    app.locals.baseUrl = app.locals.baseUrl + '/';
  }

  app.getBaseUrl = function () {
    return app.locals.baseUrl;
  };

  const server = config.https ? https.createServer(config.https, app) : http.createServer(app);

// jshint maxstatements: 60, maxcomplexity: 60

  function onError(error) {
    sysLog.error(error);
    server.close(() => {
      process.exit(130);
    });
  }

  function start(ports, i) {
    return new Promise((resolve, reject) => {
      server.once('error', function (err) {
        if (err.code !== 'EADDRINUSE') {
          return reject(err);
        }
        sysLog.info(format(t('Failed to connect to port %s'), ports[i]));
        start(ports, i + 1).then(resolve).catch(reject);
      });
      if (i < ports.length) {
        server.listen(ports[i], resolve);
      } else {
        reject(new Error(t('Failed to start server. All specified ports are busy.')));
      }
    });
  }

  function moduleLoader(name, module) {
    return function () {
      sysLog.info(format(t('Loading module %s'), name));
      return module._init(name).then(() => {
        module.path = name;
        sysLog.info(format(t('Module %s loaded.'), name));
      });
    };
  }

  let moduleTitles;

  return load(path.join(rootPath, 'i18n'))
    .then(
      () => {
        sysLog.info(t('Starting ION application'));
        return di('boot',
          extend(
            true,
            {
              rtEvents: {
                module: '@iondv/core/classes/RuntimeEvents',
                options: {
                  target: 'ion://server',
                  stopEvent: 'close'
                }
              },          
              settings: {
                module: '@iondv/commons/lib/settings/SettingsRepository',
                initMethod: 'init',
                initLevel: 1,
                options: {
                  logger: 'ion://sysLog'
                }
              }
            },
            config.bootstrap || {}
          ),
          {
            server: server,
            application: app,
            sysLog: sysLog
          }
        );
      }
    )
    .then(scope => di('app', extend(true, config.di || {}, scope.settings.get('plugins') || {}), {}, 'boot'))
    .then(scope => alias(scope, scope.settings.get('di-alias') || {}))
    .then((scope) => {
      if (typeof onScope === 'function') {
        onScope(scope);
      }
      return scope;
    })
    .then((scope) => {
      let defaultModule = null;
      let themeName = config.theme || 'default';
      if (scope.settings && scope.settings instanceof SettingsRepository) {
        defaultModule = scope.settings.get('defaultModule');
        moduleTitles = scope.settings.get('moduleTitles') || {};
        themeName = scope.settings.get('theme') || themeName;
      }

      const themePath = theme.resolve(rootPath, themeName);

      theme(app, '', rootPath, themeName, sysLog);

      if (!defaultModule && config.defaultModule) {
        defaultModule = config.defaultModule;
      }

      if (!defaultModule) {
        throw new Error(t('Default module not specified.'));
      }

      app.locals.defaultModule = defaultModule;
      app.locals.pageTitle = scope.settings.get('pageTitle') || 'IONDV. Framework';

      app.get('/', (req, res) => {
        res.redirect(app.locals.baseUrl + defaultModule);
      });

      if (scope.oauth) {
        app.post('/oauth2/token', scope.oauth.token());
      }

      scope.auth.setTopLevelAuth();

      if (scope.oauth) {
        app.use('/oauth2/grant', scope.oauth.grant());
      }

      const themeI18n = path.join(themePath, 'i18n');
      return load(themeI18n).then(() => scope);
    })
    .then((scope) => {
      if (typeof dispatcher === 'function') {
        dispatcher(app);
      }
      sysLog.info(t('Loading web-modules.'));
      const sysMenu = [];
      let moduleInitiators = null;

      Object.keys(modules || {}).forEach((name) => {
        const module = modules[name];
        if (typeof module === 'function') {
          let title = moduleTitles[name] || module.locals.sysTitle;
          if (title) {
            sysMenu.push(
              {
                name,
                description: title.description || title,
                order: title.order || 0
              }
            );
            module.locals.sysTitle = title;
          }
          module.locals.sysMenu = sysMenu;
          module.locals.baseUrl = config.baseUrl || '/';
          app.use(`/${name}`, (req, res, next) => {
            req.moduleName = name;
            next();
          }, module);
          if (typeof module._init === 'function') {
            if (moduleInitiators) {
              moduleInitiators = moduleInitiators.then(moduleLoader(name, module));
            } else {
              moduleInitiators = moduleLoader(name, module)();
            }
          }
        } else {
          sysLog.warn(format(t('Module %s is not an express.js application.'), candidates[i]));
        }
      });
      for (let ref in moduleTitles) {
        if (moduleTitles[ref] && moduleTitles[ref].url) {
          sysMenu.push(
            {
              name: moduleTitles[ref].url,
              description: moduleTitles[ref].title || ref,
              external: true,
              order: moduleTitles[ref].order || 0
            }
          );
        }
      }
      sysMenu.sort((a, b) => a.order - b.order);
      if (moduleInitiators) {
        return moduleInitiators.then(() => {
          sysLog.info(t('All modules are loaded.'));
          return scope;
        });
      }
      return scope;
    })
    .then((scope) => {
      let ports = config.port;
      if (ports && !Array.isArray(ports)) {
        ports = [ports];
      }
      if (ports.length === 0) {
        ports.push(config.https ? 443 : 80);
      }
      return start(ports, 0).then(() => scope);
    })
    .then((scope) => {
      server.on('error', onError);
      if (typeof server.address() === 'string') {
        sysLog.info(format(t('Listening to conveyer %s'), server.address()));
      } else {
        sysLog.info(format(t('Listening to port %s'), server.address().port));
      }
      if (typeof onStart === 'function') {
        onStart(scope);
      }
      process.on('SIGTERM', () => {
        server.close();
      });
    })
    .catch(onError);
};
