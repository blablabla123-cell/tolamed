'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.addConstraint('bonus_transactions', {
      fields: ['user_id', 'request_id'],
      type: 'unique',
      name: 'bonus_transactions_user_id_request_id_uq',
    })
  },

  async down(queryInterface, Sequelize) {
    return queryInterface.removeConstraint('bonus_transactions', 'bonus_transactions_user_id_request_id_uq');
  }
};
