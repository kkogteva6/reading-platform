import { Link } from "react-router-dom";
import "./landing.css";

export default function Landing() {
  return (
    <div className="landing-wrapper">
      <div className="landing-card">
        <h1 className="landing-title">LANDING TEST ✅</h1>
        <h1 className="landing-title">Платформа развивающего чтения</h1>

        <div className="landing-buttons">
          <Link to="/login" className="btn primary">
            Вход
          </Link>

          <Link to="/register" className="btn secondary">
            Регистрация
          </Link>
        </div>

        <div className="landing-footer">
          Тестовые аккаунты:<br />
          student@test.ru / parent@test.ru / teacher@test.ru / admin@test.ru<br />
          Пароль: <strong>1234</strong>
        </div>
      </div>
    </div>
  );
}