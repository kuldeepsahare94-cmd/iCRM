const { createActivityRouter } = require('./activityRouterFactory');

module.exports = createActivityRouter({
  moduleApiName: 'meetings',
  tableName: 'meetings',
  titleColumn: 'meeting_title',
  columns: [
    { name: 'meeting_title' },
    { name: 'related_module' },
    { name: 'related_record_id' },
    { name: 'meeting_type' },
    { name: 'location' },
    { name: 'video_link' },
    { name: 'start_datetime' },
    { name: 'end_datetime' },
    { name: 'organizer_id' },
    { name: 'assigned_user_id' },
    { name: 'status', default: 'Scheduled' },
    { name: 'agenda' },
    { name: 'meeting_notes' },
    { name: 'outcome' },
    { name: 'next_action' },
  ],
});
