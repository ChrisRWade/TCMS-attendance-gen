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
  let remainder = minutes % 15;
  let adjustment = remainder < 8 ? -remainder : 15 - remainder;
  rounded.add(adjustment, "minutes");
  return rounded;
}

function filterAndRoundPunches(punches) {
  const adjustedPunches = [];
  let isFirstPunchHandled = false;

  for (let i = 0; i < punches.length; i++) {
    let punchMoment = moment.tz(punches[i], "America/New_York");

    // Adjust the first punch if it's before 8 AM and hasn't been handled yet
    if (!isFirstPunchHandled) {
      if (punchMoment.hour() < 8) {
        punchMoment.hour(8).minute(0);
      }
      isFirstPunchHandled = true;
    } else {
      // For subsequent punches, round to the nearest quarter hour
      let minutes = punchMoment.minute();
      let adjustment = minutes % 15;
      let addMinutes = adjustment < 8 ? -adjustment : 15 - adjustment;
      punchMoment.add(addMinutes, "minutes");
    }

    // Skip adding punches that are part of a short break
    if (i + 1 < punches.length) {
      const nextPunchMoment = moment.tz(punches[i + 1], "America/New_York");
      const duration = nextPunchMoment.diff(punchMoment, "minutes");

      if (duration <= 20) {
        // Adjust i to skip the next punch
        i++;
        continue;
      }
    }

    // Add the adjusted punch to the list
    adjustedPunches.push(punchMoment.format());
  }

  return adjustedPunches;
}

function calculateWorkHours(punches) {
  if (!punches || punches.length === 0) {
    return -0.0; // No punches to calculate hours
  }
  if (punches.length % 2 !== 0) {
    return null; // Must have an even number of punches to calculate hours
  }
  let totalMinutes = 0;
  const adjustedPunches = filterAndRoundPunches(punches);

  for (let i = 0; i < adjustedPunches.length; i += 2) {
    if (i + 1 < adjustedPunches.length) {
      const inTime = moment.tz(adjustedPunches[i], "America/New_York");
      const outTime = moment.tz(adjustedPunches[i + 1], "America/New_York");

      let duration = outTime.diff(inTime, "minutes");
      totalMinutes += duration;
    }
  }

  // Convert total minutes to hours and round to the nearest quarter-hour
  let totalHours = totalMinutes / 60;
  return Math.round(totalHours * 4) / 4;
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
  // Define atypical user IDs
  const atypicalUserIds = ["374"];

  // Function to check if a user is atypical
  const isAtypicalUser = (userId) => atypicalUserIds.includes(userId);

  return (
    <div>
      {Object.entries(data).map(([gName, users]) => (
        <div key={gName} className={styles.department}>
          <h2>{gName}</h2>
          {Object.entries(users).map(([username, userInfo]) => {
            //initialize totalHours for each user
            let totalHours = 0;

            return (
              <div key={userInfo.userid} className={styles.employee}>
                <div className={styles.employeeDetail}>
                  <h5>{username}</h5>
                  <h5 className={styles.employeeId}>({userInfo.userid})</h5>
                </div>
                {Object.entries(userInfo.dates).map(([date, checktimes]) => {
                  // Remove duplicate times after conversion and ensure they're unique
                  const uniquePunches = removeDuplicatePunches(checktimes);
                  const totalPunches = uniquePunches.length;

                  const punchesInEastern = uniquePunches.map((time) =>
                    moment.tz(time, "America/New_York").format()
                  );

                  let hoursWorked = calculateWorkHours(punchesInEastern);

                  // If user belongs to "8 - Office" with only 2 punches and hours >= 6, adjust hours
                  if (
                    gName === "8 - Office" &&
                    uniquePunches.length === 2 &&
                    hoursWorked >= 6
                  ) {
                    hoursWorked -= 0.5; // Deduct half an hour
                  }

                  totalHours += hoursWorked;

                  const lateLunchIndex =
                    determineLunchPunchIndex(uniquePunches);
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
                      <div className={styles.dayDetails}>
                        <h5 className={styles.calendarDate}>{date}</h5>
                        <span className={styles.dayOfWeek}>
                          ({getDayOfWeek(date)})
                        </span>
                      </div>
                      <ul className={styles.punches}>
                        {punchesInEastern.map((time, index) => (
                          <li
                            key={index}
                            className={`${
                              index === 0 &&
                              isLatePunch(time) &&
                              !isAtypicalUser(userInfo.userid)
                                ? styles.latePunch
                                : ""
                            } ${
                              index === lateLunchIndex &&
                              isLateLunch &&
                              !isAtypicalUser(userInfo.userid)
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
                        H:
                        {typeof hoursWorked === "number" && !isNaN(hoursWorked)
                          ? hoursWorked.toFixed(2)
                          : "???"}
                      </div>
                    </div>
                  );
                })}
                <div className={styles.totalHours}>
                  <span>
                    <strong>T: {totalHours.toFixed(2)}</strong>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      <div className={`${styles.printFooter} ${styles.noPrint}`}>
        Weekly Attendance - {startDate} - {endDate}
      </div>
    </div>
  );
};
export default ReportViewer;
