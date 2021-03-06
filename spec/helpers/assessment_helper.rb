# frozen_string_literal: true

require 'page_objects/assessment_form'
require 'page_objects/client_profile'
require 'page_objects/staff_dashboard'

class AssessmentHelper
  include RSpec::Matchers
  def initialize
    @form = AssessmentForm.new
    @staff_dash = StaffDashboard.new
    @client_profile = ClientProfile.new
  end

  def start_assessment_for(client_name, should_start_prefilled = false)
    visit_start_assessment client_name
    is_reassessment = @form.is_reassessment?
    @form.reassessment_modal.start should_start_prefilled if is_reassessment

    expect(@form.header.child_name).to have_content(client_name)
    is_reassessment
  end

  def visit_start_assessment(client_name)
    @staff_dash.client_link(client_name).text eq(client_name)
    @staff_dash.visit_client_profile(client_name)
    expect(@client_profile).to have_add_cans_button
    @client_profile.add_cans_button.click
  end

  def visit_assessment_comparison(client_name)
    @staff_dash.client_link(client_name).text eq(client_name)
    @staff_dash.visit_client_profile(client_name)
    expect(@client_profile).to have_assessment_comparison_button
    @client_profile.assessment_comparison_button.click
  end
end
