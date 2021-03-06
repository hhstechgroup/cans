import React from 'react'
import { render } from 'react-dom'
import App from './App'
import { timeoutService } from './util/TimeoutService'

import 'bootstrap/dist/css/bootstrap.min.css'
import '@cwds/components/scss/global.scss'
import 'react-widgets/dist/css/react-widgets.css'

document.addEventListener('DOMContentLoaded', () => {
  const node = document.getElementById('root')
  const data = JSON.parse(node.getAttribute('data'))
  render(<App {...data} />, node)
})

timeoutService.run()
