import React from 'react';
import './App.css';
import { MediaAndVisuals } from './MediaAndVisuals';
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
              <Route path="/main/:useMockImage/">
                <MediaAndVisuals useMockImage={true} />
              </Route>
              <Route path="/main">
                <MediaAndVisuals useMockImage={false} />
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
