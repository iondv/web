module.exports = {
  onError: require('./error'),
  respond: require('./respond'),
  api: {
    notifications: require('./controllers/api/notifications'),
    markAsViewed: require('./controllers/api/markAsViewed'),
    markAllAsViewed: require('./controllers/api/markAllAsViewed'),
    moreViewedNotifications: require('./controllers/api/moreViewedNotifications'),
    i18n: require('./controllers/api/i18n')
  }
};
