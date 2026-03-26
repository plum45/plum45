/**
 * Cron Manager (Nanobot Inspired)
 * Allows Stacy to schedule reminders and future tasks.
 */
const cron = require('node-cron');

// Store active jobs to allow cancellation
const activeJobs = new Map();

/**
 * Schedules a task.
 * @param {string} name - Unique name for the job.
 * @param {string} schedule - Cron expression (e.g., "* * * * *") or a standard date string.
 * @param {string} task - Description of the task to perform.
 * @param {object} ctx - Telegraf context for replying.
 * @param {function} smartReply - Utility function to send replies.
 */
function scheduleTask({ name, schedule, task, ctx, smartReply }) {
    console.log(`⏰ [Cron Manager]: Attempting to schedule "${name}" with pattern: ${schedule}`);

    // If a job with the same name exists, stop it first
    if (activeJobs.has(name)) {
        activeJobs.get(name).stop();
        activeJobs.delete(name);
    }

    let finalSchedule = schedule;

    // Validate and convert if not a raw cron expression
    if (!cron.validate(schedule)) {
        console.log(`⚠️ [Cron Manager]: '${schedule}' is not a valid cron expression. Attempting Date parse...`);
        const targetDate = new Date(schedule);
        
        if (isNaN(targetDate.getTime())) {
            console.error(`❌ [Cron Manager]: Failed to parse '${schedule}' as a Date or Cron.`);
            return false; // Tells actions.js to show the error message
        }

        // Convert future Date to a one-time cron expression
        const minutes = targetDate.getMinutes();
        const hours = targetDate.getHours();
        const dom = targetDate.getDate();
        const month = targetDate.getMonth() + 1;
        
        finalSchedule = `${minutes} ${hours} ${dom} ${month} *`;
        console.log(`✅ [Cron Manager]: Converted Date to Cron -> ${finalSchedule}`);
    }

    try {
        const job = cron.schedule(finalSchedule, async () => {
            console.log(`🔔 [Cron Trigger]: Running task "${name}"`);
            await smartReply(ctx, `⏰ **Stacy Reminder:** ${task}`);
            
            // Auto-clean one-time jobs (heuristic: if it has specific DOM and Month, it's likely one-time)
            if (finalSchedule !== schedule && activeJobs.has(name)) {
                 activeJobs.get(name).stop();
                 activeJobs.delete(name);
            }
        }, {
            scheduled: true,
            timezone: "Asia/Bangkok"
        });

        activeJobs.set(name, job);
        return finalSchedule;
    } catch (e) {
        console.error(`❌ [Cron Manager] Error: ${e.message}`);
        return false;
    }
}

module.exports = { scheduleTask };
