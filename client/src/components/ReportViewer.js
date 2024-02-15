import React from "react";
import styles from "./ReportViewer.module.css";

const moment = require("moment-timezone");

function formatTimeToEastern(timeString) {
  const date = new Date(timeString);
  return date.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function getDayOfWeek(dateString) {
  // Append "T08:00:00" to set the time to 8 AM
  const date = new Date(`${dateString}T08:00:00`);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "America/New_York",
  });
}

const isOdd = (num) => num % 2 !== 0;

const isLatePunch = (time) => {
  const punchTime =
    new Date(time).getHours() + new Date(time).getMinutes() / 60;
  return punchTime > 8;
};

function isLateFromLunch(punches) {
  // Convert all punches to Eastern time and format them for comparison
  const formattedPunches = punches.map((punch) =>
    moment.tz(punch, "America/New_York").format("HH:mm")
  );

  let lunchPunchIndex = null;

  // Determine which punch to check based on the number of punches
  if (formattedPunches.length === 4) {
    lunchPunchIndex = 2; // 3rd punch (0-based index)
  } else if (formattedPunches.length === 6) {
    // It's either the 3rd or the 5th punch, but we verify by checking if it starts with "12"
    lunchPunchIndex = formattedPunches[2].startsWith("12") ? 2 : 4;
  } else if (formattedPunches.length === 8) {
    lunchPunchIndex = 4; // 5th punch
  }

  // If we've identified a lunch punch, check if it's late
  if (lunchPunchIndex !== null) {
    const lunchPunchTime = formattedPunches[lunchPunchIndex];
    // Assuming lunch is from 12:00 to 12:30, any punch starting with "12:3" or later is late
    return lunchPunchTime >= "12:31";
  }

  // Default to not late if there's no lunch punch to check
  return false;
}

function determineLunchPunchIndex(punches) {
  if (punches.length === 4) {
    return 2; // 3rd punch
  } else if (punches.length === 6) {
    const formattedThirdPunch = moment
      .tz(punches[2], "America/New_York")
      .format("HH:mm");
    return formattedThirdPunch.startsWith("12") ? 2 : 4;
  } else if (punches.length === 8) {
    return 4; // 5th punch
  }
  return null; // No lunch punch index
}

function roundToNearestQuarterHour(time) {
  let rounded = moment(time);
  let minutes = rounded.minute();
  let offset = 15 - (minutes % 15);
  if (offset === 15) offset = 0; // If exactly on a quarter hour, don't add any offset
  if (minutes % 15 > 7) {
    // More than halfway, round up
    rounded = rounded.add(offset, "minutes");
  } else {
    // Less than halfway, round down
    rounded = rounded.subtract(minutes % 15, "minutes");
  }
  return rounded;
}

function roundTotalHoursToNearestQuarter(hours) {
  // Convert hours to a total of minutes to handle rounding more granularly
  let totalMinutes = hours * 60;
  // Round to the nearest quarter-hour in minutes
  totalMinutes = Math.round(totalMinutes / 15) * 15;
  // Convert back to hours
  return totalMinutes / 60;
}

function calculateWorkHours(punches) {
  let totalMinutes = 0;

  for (let i = 0; i < punches.length; i += 2) {
    if (i + 1 < punches.length) {
      // Ensure there's a pair
      // Convert and adjust punch times to Eastern Time
      let inTime = moment.tz(punches[i], "America/New_York");
      const outTime = moment.tz(punches[i + 1], "America/New_York");

      // If the first punch of the day is before 8 AM, adjust it to 8 AM
      if (i === 0 && inTime.hour() < 8) {
        inTime.hour(8).minute(0).second(0);
      }

      // Round punch times to the nearest quarter-hour
      inTime = roundToNearestQuarterHour(inTime).valueOf();
      const roundedOutTime = roundToNearestQuarterHour(outTime).valueOf();

      let duration = (roundedOutTime - inTime) / (1000 * 60); // Calculate duration in minutes

      totalMinutes += duration;
    }
  }

  // Convert total minutes to hours, then round to the nearest quarter-hour
  const totalHours = totalMinutes / 60;
  return roundTotalHoursToNearestQuarter(totalHours);
}

function removeDuplicatePunches(punches) {
  const uniquePunches = [];
  const seenTimes = new Set();

  punches.forEach((punch) => {
    const formattedPunch = moment.tz(punch, "America/New_York").format("HH:mm"); // Ensure consistent formatting
    if (!seenTimes.has(formattedPunch)) {
      uniquePunches.push(punch); // Keep the original punch for further processing
      seenTimes.add(formattedPunch);
    }
  });

  return uniquePunches;
}

function isOverPunch(punchTime, index, totalPunches) {
  const formattedTime = moment
    .tz(punchTime, "America/New_York")
    .format("HH:mm");

  // Check if the first punch is 7:40 AM or before
  if (index === 0 && formattedTime <= "07:40") {
    return true;
  }

  // Check if the last punch is 4:40 PM or later
  if (index === totalPunches - 1 && formattedTime >= "16:40") {
    return true;
  }

  return false;
}

const ReportViewer = ({data, startDate, endDate}) => {
  return (
    <div>
      {Object.entries(data).map(([gName, users]) => (
        <div key={gName} className={styles.department}>
          <h2>{gName}</h2>
          {Object.entries(users).map(([username, userInfo]) => (
            <div key={userInfo.userid} className={styles.employee}>
              <div>
                <h3>{username}</h3>
                <h5>{userInfo.userid}</h5>
              </div>
              {Object.entries(userInfo.dates).map(([date, checktimes]) => {
                // Remove duplicate times after conversion and ensure they're unique
                const uniquePunches = removeDuplicatePunches(checktimes);
                const totalPunches = uniquePunches.length;

                const punchesInEastern = uniquePunches.map((time) =>
                  moment.tz(time, "America/New_York").format()
                );
                const hoursWorked = calculateWorkHours(punchesInEastern);
                const lateLunchIndex = determineLunchPunchIndex(uniquePunches);
                const isLateLunch =
                  lateLunchIndex !== null
                    ? isLateFromLunch(uniquePunches)
                    : false;

                return (
                  <div
                    key={date}
                    className={`${styles.date} ${
                      isOdd(uniquePunches.length) ? styles.oddPunches : ""
                    }`}
                  >
                    <h4>{date}</h4>
                    <span>{getDayOfWeek(date)}</span>
                    <ul className={styles.punches}>
                      {punchesInEastern.map((time, index) => (
                        <li
                          key={index}
                          className={`${
                            (index === 0 && isLatePunch(time)) ||
                            (index === lateLunchIndex && isLateLunch)
                              ? styles.latePunch
                              : ""
                          } ${
                            isOverPunch(time, index, totalPunches)
                              ? styles.isOver
                              : ""
                          }`}
                        >
                          {formatTimeToEastern(time)}
                        </li>
                      ))}
                    </ul>
                    {/* Display calculated hours worked for the day */}
                    <div className={styles.hoursWorked}>
                      H: {hoursWorked.toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}
      <div className={`${styles.printFooter} ${styles.noPrint}`}>
        Weekly Attendance - {startDate} - {endDate}
      </div>
    </div>
  );
};
export default ReportViewer;
