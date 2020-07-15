import React from 'react';
import './App.css';
import { Main } from './Main';
import { Link, Switch, Route, BrowserRouter as Router } from 'react-router-dom';

function App() {
  return (
    <Router>
      <div className="App">
        <ul>
                  <li>
                    <Link to="/">Home</Link>
                  </li>
                  <li>
                    <Link to="/main">Do Stuff</Link>
                  </li>
                </ul>
        <header className="App-header">
          <Switch>
              <Route path="/main">
                <Main />
              </Route>
              <Route path="/">
                <div>This is Root</div>
              </Route>
          </Switch>
        </header>
      </div>
    </Router>
  );
}

export default App;
