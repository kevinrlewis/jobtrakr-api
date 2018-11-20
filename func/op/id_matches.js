var jwt = require('jsonwebtoken');

module.exports = function(id, token) {
  var decoded = jwt.decode(token);
  console.log(decoded);
  return parseInt(decoded.sub) === id;
}
