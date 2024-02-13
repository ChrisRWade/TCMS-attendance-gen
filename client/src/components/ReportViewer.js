import React from "react";
import styles from "./ReportViewer.module.css";

//hello

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

function updatePrintFooter(startDate, endDate) {
  document.getElementById("printStartDate").textContent = startDate;
  document.getElementById("printEndDate").textContent = endDate;
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
                // Convert checktimes to Eastern time zone before passing to calculateWorkHours
                const punchesInEastern = checktimes.map((time) =>
                  moment.tz(time, "America/New_York").format()
                );
                const hoursWorked = calculateWorkHours(punchesInEastern);
                return (
                  <div
                    key={date}
                    className={`${styles.date} ${
                      isOdd(checktimes.length) ? styles.oddPunches : ""
                    }`}
                  >
                    <h4>{date}</h4>
                    <span>{getDayOfWeek(date)}</span>
                    <ul className={`${styles.punches}`}>
                      {checktimes.map((time, index) => (
                        <li
                          key={index}
                          className={
                            index === 0 && isLatePunch(time)
                              ? styles.latePunch
                              : ""
                          }
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
      </div>{" "}
    </div>
  );
};
export default ReportViewer;
