import styles from "./page.module.css";

export default function Home() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <div className={styles.intro}>
          <span className={styles.mark}>▲</span>
          <h1>GreyHub</h1>
          <p>Work orders, crews and payouts in one place.</p>
        </div>
      </main>
    </div>
  );
}
