// Layout.js
import React, {useState} from "react";
import DateSelector from "./DateSelector";
import ReportViewer from "./ReportViewer";
import styles from "./Layout.module.css";
const moment = require("moment-timezone");

function generateDateRange(startDate, endDate) {
  const start = moment(startDate);
  const end = moment(endDate);
  const dates = [];

  while (start <= end) {
    dates.push(start.format("YYYY-MM-DD"));
    start.add(1, "days");
  }

  return dates;
}

function preprocessDataForReport(data, startDate, endDate) {
  const allDates = generateDateRange(startDate, endDate);
  const preprocessedData = {};

  Object.entries(data).forEach(([gName, users]) => {
    preprocessedData[gName] = preprocessedData[gName] || {};

    Object.entries(users).forEach(([username, userInfo]) => {
      const userDates = Object.keys(userInfo.dates);
      const completeDates = {};

      allDates.forEach((date) => {
        completeDates[date] = userDates.includes(date)
          ? userInfo.dates[date]
          : [];
      });

      preprocessedData[gName][username] = {...userInfo, dates: completeDates};
    });
  });

  return preprocessedData;
}

const Layout = () => {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reportData, setReportData] = useState(null);

  const handleSubmit = async () => {
    const response = await fetch(
      `http://localhost:3001/api/report?startDate=${startDate}&endDate=${endDate}`
    );
    let data = await response.json();

    // Preprocess data to ensure consistency across the date range
    if (data && startDate && endDate) {
      data = preprocessDataForReport(data, startDate, endDate);
    }

    setReportData(data);
    console.log(data);
  };

  return (
    <div className={styles.container}>
      <DateSelector
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
      />{" "}
      <button onClick={handleSubmit} className={styles.noPrint}>
        Submit
      </button>
      {!reportData && (
        <h1 className={styles.reminder}>
          Have you imported punch data in TCMS V3?
        </h1>
      )}
      {reportData && (
        <ReportViewer
          data={reportData}
          startDate={startDate}
          endDate={endDate}
        />
      )}
    </div>
  );
};

export default Layout;
