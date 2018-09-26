import React from "react";
import { withRouter } from "react-router-dom";
import find from "lodash/find";
import findIndex from "lodash/findIndex";
import indexOf from "lodash/indexOf";

import Loader from "./Loader";
import StepMessage from "./StepMessage";
import StepBuildingAssets from "./StepBuildingAssets";
import StepHelmIntro from "../../containers/HelmChartInfo";
import StepHelmValues from "../kustomize/HelmValuesEditor";
import StepTerraform from "./StepTerraform";
import StepKubectlApply from "./StepKubectlApply";
import KustomizeEmpty from "../kustomize/kustomize_overlay/KustomizeEmpty";
import KustomizeOverlay from "../../containers/KustomizeOverlay";
import ConfigOnly from "../../containers/ConfigOnly";
import { fetchContentForStep } from "../../redux/data/appRoutes/actions";

export class DetermineComponentForRoute extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      maxPollReached: false,
    };
  }

  componentDidMount() {
    const { getContentForStep, routeId } = this.props;
    getContentForStep(routeId);
  }

  handleAction = async (action, gotoNext) => {
    await this.props.finalizeStep({action});
    if (gotoNext) {
      this.gotoRoute();
    }
  }

  getContentForStep = () => {
    const { getContentForStep, routeId } = this.props;
    getContentForStep(routeId);
  }

  gotoRoute = (route) => {
    let nextRoute = route;
    const { basePath } = this.props;

    if (!nextRoute) {
      const currRoute = find(this.props.routes, ["id", this.props.routeId]);
      const currIndex = indexOf(this.props.routes, currRoute);
      nextRoute = this.props.routes[currIndex + 1];
    }

    if (!nextRoute) {
      return this.handleShutdown();
    }
    this.props.history.push(`${basePath}/${nextRoute.id}`);

  }

  handleShutdown = async () => {
    const { basePath } = this.props;
    const url = `${this.props.apiEndpoint}/shutdown`;
    await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
      },
    });
    await this.props.shutdownApp();
    this.props.history.push(`${basePath}/done`);
  }

  skipKustomize = async () => {
    const {
      actions: kustomizeIntroActions,
      routes,
      apiEndpoint,
    } = this.props;
    this.handleAction(kustomizeIntroActions[0]);

    const kustomizeStepIndex = findIndex(routes, { phase: "kustomize" });
    const kustomizeStep = routes[kustomizeStepIndex];
    const stepAfterKustomize = routes[kustomizeStepIndex + 1];

    let { actions: kustomizeActions } = await fetchContentForStep(apiEndpoint, kustomizeStep.id);
    // TODO: Revert when https://github.com/replicatedhq/ship/issues/596 is addressed
    if (!kustomizeActions) {
      ({ actions: kustomizeActions } = await fetchContentForStep(apiEndpoint, kustomizeStep.id));
    }
    this.handleAction(kustomizeActions[0]);

    this.startPoll(kustomizeStep.id, () => this.gotoRoute(stepAfterKustomize));
  }

  startPoll = async (routeId, cb) => {
    if (!this.props.isPolling) {
      this.props.pollContentForStep(routeId, cb);
    }
  }

  startPollingStep = (location, routeId) => {
    const { initializeStep, basePath } = this.props;
    if (location.pathname === `${basePath}/${routeId}`) {
      initializeStep(routeId);
      this.startPoll(routeId, () => {
        // Timeout to wait a little bit before transitioning to the next step
        setTimeout(this.gotoRoute, 500);
      });
    }
  }

  renderStep = (phase) => {
    const {
      currentStep,
      progress,
      actions,
      location,
      initializeStep,
      routes,
      basePath
    } = this.props;
    const { id: routeId } = find(routes, { phase });

    if (!phase || !phase.length) return null;
    switch (phase) {
    case "requirementNotMet":
      return (
        <div className="flex1 flex-column justifyContent--center alignItems--center">
          <p className="u-fontSize--large u-fontWeight--medium u-color--tundora u-marginBottom--20">Whoa there, you're getting a little ahead of yourself. There are steps that need to be completed before you can be here.</p>
          <button className="btn primary" onClick={this.props.history.goBack}>Take me back</button>
        </div>
      )
    case "message":
      return (
        <StepMessage
          actions={actions}
          message={currentStep.message}
          level={currentStep.level}
          handleAction={this.handleAction}
          isLoading={this.props.dataLoading.submitActionLoading}
        />
      );
    case "config":
      return (
        <ConfigOnly
          actions={actions}
          handleAction={this.handleAction}
          routeId={this.props.routeId}
        />
      );
    case "stream":
      return (
        <StepMessage
          actions={actions}
          message={currentStep.message}
          level={currentStep.level}
          handleAction={this.handleAction}
          isLoading={this.props.dataLoading.submitActionLoading || !currentStep.message.contents}
        />
      );
    case "render":
      return (
        <StepBuildingAssets
          startPollingStep={this.startPollingStep}
          routeId={routeId}
          location={location}
          status={progress || currentStep.status}
        />
      );
    case "terraform":
      return (
        <StepTerraform
          startPollingStep={this.startPollingStep}
          routeId={routeId}
          startPoll={this.startPoll}
          location={location}
          status={progress || currentStep.status}
          handleAction={this.handleAction}
          gotoRoute={this.gotoRoute}
          initializeStep={initializeStep}
        />
      );
    case "kubectl":
      return (
        <StepKubectlApply
          startPollingStep={this.startPollingStep}
          routeId={routeId}
          startPoll={this.startPoll}
          location={location}
          status={progress || currentStep.status}
          handleAction={this.handleAction}
          gotoRoute={this.gotoRoute}
          initializeStep={initializeStep}
        />
      );
    case "helm-intro":
      return (
        <StepHelmIntro
          actions={actions}
          shipAppMetadata={this.props.shipAppMetadata}
          handleAction={this.handleAction}
          isLoading={this.props.dataLoading.submitActionLoading}
        />
      );
    case "helm-values":
      return (
        <StepHelmValues
          saveValues={this.props.saveHelmChartValues}
          getStep={currentStep.helmValues}
          shipAppMetadata={this.props.shipAppMetadata}
          actions={actions}
          handleAction={this.handleAction}
          isLoading={this.props.dataLoading.submitActionLoading}
        />
      );
    case "kustomize-intro":
      return (
        <KustomizeEmpty
          actions={actions}
          handleAction={this.handleAction}
          skipKustomize={this.skipKustomize}
        />
      );
    case "kustomize":
      return (
        <KustomizeOverlay
          startPoll={this.startPoll}
          getCurrentStep={this.getContentForStep}
          pollCallback={this.gotoRoute}
          routeId={this.props.routeId}
          actions={actions}
          isNavcycle={true}
          finalizeStep={this.props.finalizeStep}
          handleAction={this.handleAction}
          currentStep={currentStep}
          skipKustomize={this.skipKustomize}
          dataLoading={this.props.dataLoading}
        />
      );
    default:
      return (
        <div className="flex1 flex-column justifyContent--center alignItems--center">
          <Loader size="60" />
        </div>
      );
    }
  }

  render() {
    const { phase, dataLoading } = this.props;
    const isLoadingStep = phase === "loading";
    return (
      <div className="flex-column flex1">
        <div className="flex-column flex1 u-overflow--hidden u-position--relative">
          <div className="flex-1-auto flex-column u-overflow--auto">
            {(isLoadingStep || dataLoading.getHelmChartMetadataLoading) && !this.state.maxPollReached ?
              <div className="flex1 flex-column justifyContent--center alignItems--center">
                <Loader size="60" />
              </div>
              : this.state.maxPollReached ?
                <div className="flex1 flex-column justifyContent--center alignItems--center">
                  <p className="u-fontSize--large u-fontWeight--medium u-color--tundora">Oops, something isn't quite right. If you continue to experience this problem contact <a href="mailto:support@replicated.com">support@replicated.com</a></p>
                </div>
                :
                this.renderStep(phase)
            }
          </div>
        </div>
      </div>
    );
  }
}

export default withRouter(DetermineComponentForRoute)
