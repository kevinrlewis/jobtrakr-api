var jwt = require('jsonwebtoken');

module.exports = function(id, token) {
  var decoded = jwt.decode(token);
  return parseInt(decoded.sub) === id;
}
