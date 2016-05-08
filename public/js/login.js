var app = angular.module('dpApp', [])
app.controller('loginCtrl', ['$scope', '$http', '$rootScope', function ($scope, $http, $rootScope) {
  $scope.login = {}
  $scope.message = ''

  $scope.pressLoginButton = function () {
    $http({
      method: 'POST',
      url: 'http://localhost:3001/api/login',
      data: $scope.login
    }).success(function (data) {
      $scope.message = 'success'
      $rootScope.user = {
        email: $scope.login.email
      }
      $rootScope.isLogin = true
    }).error(function (data) {
      $scope.message = data.message
    })
  }
}])
