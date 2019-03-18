import React, { Component, Fragment } from 'react'
import { Redirect } from 'react-router-dom'
import PropTypes from 'prop-types'
import { clone } from '../../util/common'
import { completeAutoScroll } from '../../util/assessmentAutoScroll'
import { AssessmentService } from './'
import { I18nService } from '../common/'
import { isReadyForAction, LoadingState } from '../../util/loadingHelper'
import AssessmentContainerInner from './AssessmentContainerInner'
import { PrintAssessment } from '../Print'
import {
  AssessmentStatus,
  defaultEmptyAssessment,
  getCaregiverDomainsNumber,
  handleCountyName,
  handlePrintButtonEnabled,
  isSubsequentType,
  postCloseMessage,
  postInfoMessage,
  postSuccessMessage,
  preparePrecedingAssessment,
  successMsgFrom,
  trimUrlForClientProfile,
  updateUrlWithAssessment,
  validateAssessmentEventDate,
  validateAssessmentForSubmit,
  getSubstanceUseItemsIds,
} from './AssessmentHelper'
import { buildSaveAssessmentButton } from '../Header/PageHeaderButtonsBuilder'
import PrintButton from '../Header/PageHeaderButtons/PrintButton'
import './style.sass'
import { isValidLocalDate, localToIsoDate } from '../../util/dateHelper'
import { logPageAction } from '../../util/analytics'
import { isAuthorized } from '../common/AuthHelper'
import UnsavedDataWarning from '../common/UnsavedDataWarning'
import pageLockService from '../common/PageLockService'
import ReassessmentModal from './ReassessmentModal'

const SCROLL_POSITION_ADJUST = 15 // for manually adjust scroll destination 15 means go down 15px more
const readOnlyMessageId = 'readonlyMessage'

export default class AssessmentContainer extends Component {
  constructor(props) {
    super(props)
    this.assessmentHeader = React.createRef()
    this.loadAssessment = this.loadAssessment.bind(this)
    this.state = {
      assessment: defaultEmptyAssessment,
      assessmentServiceStatus: LoadingState.idle,
      i18n: {},
      isValidForSubmit: false,
      shouldRedirectToClientProfile: false,
      isEditable: false,
      isValidDate: true,
      isEventDateBeforeDob: false,
      isSaveButtonEnabled: false,
      completeScrollTarget: 0,
      isUnsaved: false,
      isReassessmentModalShown: false,
      substanceUseItemsIds: {
        aboveSix: [],
        underSix: [],
      },
    }
  }

  async componentDidMount() {
    this.handleCompleteScrollTarget()
    this.loadAssessment()
  }

  componentDidUpdate(prevProps, prevState) {
    const isUnsavedChanged = prevState.isUnsaved !== this.state.isUnsaved
    this.updateSaveButtonStatusIfNeeded(isUnsavedChanged)
  }

  componentWillUnmount() {
    this.props.pageHeaderController.updateHeaderButtonsToDefault()
    postCloseMessage(readOnlyMessageId)
  }

  loadAssessment() {
    const assessmentId = this.props.match.params.id
    return (assessmentId ? this.fetchAssessment(assessmentId) : this.fetchNewAssessment()).then(() => {
      this.updateIsEditableState()
    })
  }

  updateIsEditableState() {
    const assessment = this.state.assessment
    const isEditable = Boolean(!assessment || !assessment.id || isAuthorized(assessment, 'update'))
    this.setState({ isEditable })
    this.postReadOnlyMessageIfNeeded()
  }

  postReadOnlyMessageIfNeeded() {
    if (!this.state.isEditable) {
      this.postReadOnlyMessage()
    }
  }

  postReadOnlyMessage() {
    const message = { messageId: readOnlyMessageId }
    if (this.state.assessment.status === AssessmentStatus.completed) {
      postInfoMessage({ ...message, message: 'This assessment was completed and is available for view only.' })
    } else if (this.state.assessment.status === AssessmentStatus.inProgress) {
      postInfoMessage({
        ...message,
        message: 'This CANS is under the jurisdiction of another county. Available for view only.',
      })
    }
  }

  initHeaderButtons(isSaveButtonEnabled) {
    const { assessment, i18n, isEditable } = this.state
    const node = (
      <PrintAssessment assessment={assessment} i18n={i18n} substanceUseItemsIds={this.state.substanceUseItemsIds} />
    )
    const leftButton = isEditable ? buildSaveAssessmentButton(this.handleSaveAssessment, isSaveButtonEnabled) : null
    const isPrintButtonEnabled = handlePrintButtonEnabled(this.state)
    const rightButton = <PrintButton node={node} isEnabled={isPrintButtonEnabled} assessmentId={assessment.id} />
    this.props.pageHeaderController.updateHeaderButtons(leftButton, rightButton)
  }

  updateSaveButtonStatusIfNeeded(isUnsavedChanged) {
    const newSaveButtonStatus = this.shouldSaveButtonBeEnabled()
    if (this.state.isSaveButtonEnabled !== newSaveButtonStatus || isUnsavedChanged) {
      this.initHeaderButtons(newSaveButtonStatus)
      this.setState({ isSaveButtonEnabled: newSaveButtonStatus })
    }
  }

  shouldSaveButtonBeEnabled() {
    const { assessment, assessmentServiceStatus, isEditable, isValidDate, isEventDateBeforeDob } = this.state
    return (
      isValidDate &&
      !isEventDateBeforeDob &&
      isEditable &&
      assessment.state.under_six !== undefined &&
      Boolean(assessment.event_date) &&
      isReadyForAction(assessmentServiceStatus)
    )
  }

  async fetchNewAssessment() {
    this.setState({ assessmentServiceStatus: LoadingState.waiting })
    try {
      const assessment = await AssessmentService.initializeAssessment(this.props.client.identifier)
      return this.onFetchNewAssessmentSuccess(assessment)
    } catch (e) {
      return this.setState({ assessmentServiceStatus: LoadingState.error })
    }
  }

  onFetchNewAssessmentSuccess(assessment) {
    this.updatePageTitle(assessment)
    this.setState({
      assessment,
      isReassessmentModalShown: isSubsequentType(assessment.assessment_type),
      isEventDateBeforeDob: !validateAssessmentEventDate(this.props.client.dob, assessment.event_date),
      assessmentServiceStatus: LoadingState.ready,
      substanceUseItemsIds: getSubstanceUseItemsIds(assessment),
    })
    this.fetchI18n(assessment.instrument_id)
  }

  updatePageTitle(assessment) {
    const isReassessment = isSubsequentType(assessment.assessment_type)
    const title = isReassessment ? 'CANS Reassessment Form' : 'CANS Assessment Form'
    this.props.pageHeaderController.updateHeaderTitle(title)
  }

  async fetchAssessment(id) {
    this.setState({ assessmentServiceStatus: LoadingState.waiting })
    try {
      const assessment = await AssessmentService.fetch(id)
      return this.onFetchAssessmentSuccess(assessment)
    } catch (e) {
      return this.setState({ assessmentServiceStatus: LoadingState.error })
    }
  }

  onFetchAssessmentSuccess(assessment) {
    this.updatePageTitle(assessment)
    this.updateAssessment(assessment)
    this.setState({
      isUnsaved: false,
      substanceUseItemsIds: getSubstanceUseItemsIds(assessment),
    })
    this.fetchI18n(assessment.instrument_id)
  }

  async fetchI18n(instrumentId) {
    try {
      const i18n = await I18nService.fetchByInstrumentId(instrumentId)
      this.onFetchI18nSuccess(i18n)
    } catch (e) {
      this.setState({ i18n: {} })
    }
  }

  async onFetchI18nSuccess(i18n) {
    await this.setState({
      i18n: i18n,
    })
    this.initHeaderButtons(this.state.isSaveButtonEnabled)
  }

  updateAssessment = assessment => {
    assessment.person = this.props.client
    const isValidForSubmit = validateAssessmentForSubmit(assessment)
    this.setState({
      assessment,
      assessmentServiceStatus: LoadingState.ready,
      isValidForSubmit,
      isUnsaved: true,
    })
  }

  handleCaregiverRemoveAll = (name, value) => {
    const tempAssessment = clone(this.state.assessment)
    tempAssessment[name] = value
    this.updateAssessment(tempAssessment)
  }

  handleCaregiverRemove = caregiverIndex => {
    const tempAssessment = clone(this.state.assessment)
    const captureCaregiverDomains = getCaregiverDomainsNumber(this.state.assessment)
    if (!caregiverIndex || captureCaregiverDomains <= 1) {
      this.handleCaregiverRemoveAll('has_caregiver', false)
    } else {
      const domains = tempAssessment.state.domains
      tempAssessment.state.domains = domains.filter(domain => domain.caregiver_index !== caregiverIndex)
      this.updateAssessment(tempAssessment)
    }
  }

  initialSave(assessment) {
    postSuccessMessage(this.props.match.url, successMsgFrom.SAVE)
    this.setState({
      assessment,
      assessmentServiceStatus: LoadingState.ready,
      isUnsaved: false,
    })
    updateUrlWithAssessment(this.props.history, this.props.match, assessment)
  }

  handleSaveAssessment = async () => {
    this.setState({ assessmentServiceStatus: LoadingState.updating })
    const assessment = this.state.assessment
    assessment.person = this.props.client
    let updatedAssessment
    if (assessment.id) {
      try {
        updatedAssessment = await AssessmentService.update(assessment.id, assessment)
        postSuccessMessage(this.props.match.url, successMsgFrom.SAVE)
        this.setState({
          assessment: updatedAssessment,
          assessmentServiceStatus: LoadingState.ready,
          isUnsaved: false,
        })
      } catch (e) {
        this.setState({ assessmentServiceStatus: LoadingState.error })
      }
    } else {
      try {
        updatedAssessment = await AssessmentService.postAssessment(assessment)
        this.initialSave(updatedAssessment)
      } catch (e) {
        this.setState({ assessmentServiceStatus: LoadingState.error })
      }
    }

    if (this.state.assessment.id) {
      this.updateIsEditableState()
      const canDisplaySummaryOnSave =
        this.state.assessment.status === AssessmentStatus.inProgress &&
        this.state.isEditable &&
        this.state.isValidForSubmit
      this.setState({ canDisplaySummaryOnSave })
      if (canDisplaySummaryOnSave) {
        // scroll the page upwards when assessment summary can display on save
        completeAutoScroll(this.state.completeScrollTarget, SCROLL_POSITION_ADJUST)
      }
      // Capture New Relic data after the assessment has been successfully saved
      const countyName = handleCountyName(this.state.assessment)
      logPageAction('assessmentSave', {
        assessment_id: this.state.assessment.id,
        assessment_county: countyName,
      })
    }
  }

  handleCompleteScrollTarget = () => {
    const element = this.assessmentHeader
    if (this.state.completeScrollTarget === 0 && element.current) {
      this.setState({
        completeScrollTarget: element.current.getBoundingClientRect().bottom,
      })
    }
  }

  handleSubmitAssessment = async () => {
    this.setState({ assessmentServiceStatus: LoadingState.updating })
    const assessment = Object.assign({}, this.state.assessment)
    assessment.status = AssessmentStatus.completed
    assessment.person = this.props.client
    if (assessment.id) {
      try {
        const submittedAssessment = await AssessmentService.update(assessment.id, assessment)
        postSuccessMessage(this.props.match.url, successMsgFrom.COMPLETE)
        this.setState({
          assessmentServiceStatus: LoadingState.ready,
          assessment: submittedAssessment,
          isUnsaved: false,
        })
      } catch (e) {
        this.setState({ assessmentServiceStatus: LoadingState.error })
      }
    } else {
      try {
        const submittedAssessment = await AssessmentService.postAssessment(assessment)
        postSuccessMessage(this.props.match.url, successMsgFrom.COMPLETE)
        pageLockService.unlock()
        updateUrlWithAssessment(this.props.history, this.props.match, submittedAssessment)
        this.setState({
          assessmentServiceStatus: LoadingState.ready,
          assessment: submittedAssessment,
          isUnsaved: false,
        })
      } catch (e) {
        this.setState({ assessmentServiceStatus: LoadingState.error })
      }
    }
    completeAutoScroll(this.state.completeScrollTarget, SCROLL_POSITION_ADJUST)
    if (this.state.assessment.id) {
      this.updateIsEditableState()
      // Capture New Relic data after the assessment has been successfully submitted
      const countyName = handleCountyName(this.state.assessment)
      logPageAction('assessmentSubmit', {
        assessment_id: this.state.assessment.id,
        assessment_county: countyName,
      })
    }
  }

  handleCancelClick = () =>
    pageLockService.confirm(() => {
      this.setState({ shouldRedirectToClientProfile: true })
    })

  handleEventDateFieldKeyUp = date => {
    const dateValue = date.target.value
    const isValidDate = isValidLocalDate(dateValue, true)
    const dob = this.props.client.dob
    const isEventDateBeforeDob = isValidDate && !validateAssessmentEventDate(dob, localToIsoDate(dateValue))
    this.setState({
      isValidDate,
      isEventDateBeforeDob,
    })
  }

  startEmptyReassessment = () => {
    const assessment = { ...this.state.assessment, preceding_assessment_id: null }
    this.updateAssessment(assessment)
    this.setState({ isReassessmentModalShown: false })
  }

  fillAssessmentWithPrecedingData = async () => {
    const assessment = this.state.assessment
    const precedingAssessmentId = assessment.preceding_assessment_id
    const precedingAssessment = await AssessmentService.fetch(precedingAssessmentId)
    preparePrecedingAssessment(precedingAssessment, assessment.event_date)
    this.updateAssessment(precedingAssessment)
    this.setState({ isReassessmentModalShown: false })
  }

  render() {
    const { client } = this.props
    const {
      shouldRedirectToClientProfile,
      isValidForSubmit,
      assessment,
      i18n,
      assessmentServiceStatus,
      isEditable,
      canDisplaySummaryOnSave,
      isReassessmentModalShown,
    } = this.state
    if (shouldRedirectToClientProfile) {
      return <Redirect push to={{ pathname: trimUrlForClientProfile(this.props.match.url) }} />
    }
    return (
      <Fragment>
        <div ref={this.assessmentHeader}>
          <ReassessmentModal
            startEmpty={this.startEmptyReassessment}
            isOpen={isReassessmentModalShown}
            fillPrecedingData={this.fillAssessmentWithPrecedingData}
          />
          <UnsavedDataWarning
            discardAndContinue={this.loadAssessment}
            saveAndContinue={this.handleSaveAssessment}
            isUnsaved={this.state.isUnsaved}
            isSavable={this.state.isSaveButtonEnabled}
            assessmentId={assessment.id}
          />
          <AssessmentContainerInner
            client={client}
            onEventDateFieldKeyUp={this.handleEventDateFieldKeyUp}
            assessment={assessment}
            i18n={i18n}
            onAssessmentUpdate={this.updateAssessment}
            assessmentServiceStatus={assessmentServiceStatus}
            isEditable={isEditable}
            onCancelClick={this.handleCancelClick}
            handleSubmitAssessment={this.handleSubmitAssessment}
            handleCaregiverRemove={this.handleCaregiverRemove}
            isValidForSubmit={isValidForSubmit}
            canDisplaySummaryOnSave={canDisplaySummaryOnSave}
            isEventDateBeforeDob={this.state.isValidDate && this.state.isEventDateBeforeDob}
            substanceUseItemsIds={this.state.substanceUseItemsIds}
          />
        </div>
      </Fragment>
    )
  }
}

AssessmentContainer.propTypes = {
  client: PropTypes.object.isRequired,
  history: PropTypes.object,
  match: PropTypes.object,
  pageHeaderController: PropTypes.shape({
    updateHeaderButtons: PropTypes.func.isRequired,
    updateHeaderButtonsToDefault: PropTypes.func.isRequired,
    updateHeaderTitle: PropTypes.func.isRequired,
  }).isRequired,
}

AssessmentContainer.defaultProps = {
  match: {
    params: {},
  },
  history: {},
}
