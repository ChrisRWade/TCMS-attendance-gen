// Layout.js
import React, {useState} from "react";
import DateSelector from "./DateSelector";
import ReportViewer from "./ReportViewer";
import styles from "./Layout.module.css";

const Layout = () => {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reportData, setReportData] = useState(null);

  const handleSubmit = async () => {
    const response = await fetch(
      `http://localhost:3001/api/report?startDate=${startDate}&endDate=${endDate}`
    );
    const data = await response.json();
    // Handle your data here
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
