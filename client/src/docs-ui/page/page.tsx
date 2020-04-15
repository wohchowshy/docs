import {
  Component,
  Host,
  h,
  State,
  Listen,
  Element,
  Prop,
  Watch,
} from "@stencil/core";
import {MatchResults} from "@stencil/router";
import {
  sidebarLayoutStyle,
  pageStyle,
  tocStyle,
  sidebarToggleClass,
  mainStyle,
} from "./page.style";
import {Page, createVNodesFromHyperscriptNodes} from "../../api";
import {updateDocumentHead} from "../../utils/update-document-head";
import {
  getFilterKeyFromPage,
  getFilterKeyFromLocalStorage,
  withFilterOverrides,
} from "../../utils/filters";
import {filterOptionsByName} from "../../utils/filter-data";
import {SetSelectedFilters} from "./page.types";
import {pageContext} from "./page.context";
import {track, AnalyticsEventType} from "../../utils/track";
import {ensureMenuScrolledIntoView} from "../../utils/ensure-menu-scrolled-into-view";
import {getPage} from "../../cache";
import {getNavHeight} from "../../utils/get-nav-height";
import {scrollToHash} from "../../utils/scroll-to-hash";
import {parseURL} from "../../utils/url/url";

@Component({tag: "docs-page", shadow: false})
export class DocsPage {
  @Element() el: HTMLElement;

  /** match path */
  @Prop() readonly match?: MatchResults;

  @State() requiresFilterSelection = false;
  @State() showMenu?: boolean;
  @State() data?: Page;
  @State() blendUniversalNav?: boolean;
  @State() sidebarStickyTop = getNavHeight("rem");
  @State() selectedFilters: Record<string, string | undefined> = {};

  setSelectedFilters: SetSelectedFilters = (updates) => {
    const overrides = withFilterOverrides(updates, this.selectedFilters);
    this.selectedFilters = {
      ...this.selectedFilters,
      ...overrides,
    };
    for (const [filterKey, filterValue] of Object.entries(overrides)) {
      localStorage.setItem(
        getFilterKeyFromLocalStorage(filterKey),
        filterValue,
      );
    }
  };

  filterKey?: string;
  filterValue?: string;

  // @ts-ignore
  @Listen("resize", {target: "window"})
  setSidebarStickyTop() {
    this.sidebarStickyTop = getNavHeight("rem");
  }

  componentDidLoad() {
    if (this.data?.menu) {
      this.setSidebarStickyTop();
    }
    const {hash} = location;
    if (hash) {
      setTimeout(() => {
        scrollToHash(hash, this.el);
      }, 100);
    }
  }

  @Watch("match")
  @Listen("popstate", {target: "window"})
  async componentWillLoad() {
    if (this.match) {
      const {path, params} = parseURL(location.pathname);
      this.blendUniversalNav = path === "/";

      track({
        type: AnalyticsEventType.PAGE_VISIT,
        attributes: {url: this.match.path},
      });

      try {
        const data = await getPage(path);
        if (data) {
          updateDocumentHead(data);
          this.filterKey = getFilterKeyFromPage(data);
          this.selectedFilters = Object.assign(
            {},
            ...Object.keys(filterOptionsByName).map((filterKey) => {
              const localStorageKey = getFilterKeyFromLocalStorage(filterKey);
              return {
                [filterKey]: localStorageKey
                  ? localStorage.getItem(localStorageKey) || undefined
                  : undefined,
              };
            }),
          );
          if (this.filterKey) {
            const {[this.filterKey]: filterValue} = params;
            if (filterValue) {
              this.filterValue = filterValue;
              this.setSelectedFilters({[this.filterKey]: this.filterValue});
            } else {
              this.requiresFilterSelection = true;
            }
          }
          this.data = data;
          this.showMenu = ((): boolean => {
            const menuItems = this.data?.menu;
            const menuItemsExist = !!(menuItems && menuItems.length > 0);
            return menuItemsExist && !this.requiresFilterSelection;
          })();
        }
      } catch (exception) {
        track({
          type: AnalyticsEventType.PAGE_DATA_FETCH_EXCEPTION,
          attributes: {url: this.match.url, exception},
        });
      }
    }
  }

  render() {
    return (
      <Host class={pageStyle}>
        <pageContext.Provider
          state={{
            selectedFilters: this.selectedFilters,
            setSelectedFilters: this.setSelectedFilters,
          }}
        >
          <docs-universal-nav
            blend={this.blendUniversalNav}
            heading="Amplify Docs"
            brand-icon="/assets/logo-light.svg"
            brand-icon-blend="/assets/logo-dark.svg"
          />
          {!this.data?.noTemplate
            ? [
                <docs-secondary-nav />,
                <div class={sidebarLayoutStyle}>
                  <amplify-toc-provider>
                    <amplify-sidebar-layout>
                      {this.showMenu && (
                        <amplify-sidebar-layout-sidebar
                          slot="sidebar"
                          top={this.sidebarStickyTop}
                        >
                          <docs-menu
                            filterKey={this.filterKey}
                            page={this.data}
                            key={this.data?.productRootLink?.route}
                          />
                        </amplify-sidebar-layout-sidebar>
                      )}
                      {this.requiresFilterSelection ? (
                        <amplify-sidebar-layout-main slot="main">
                          <amplify-toc-contents>
                            {this.filterKey === "integration" ? (
                              <docs-choose-integration-anchor
                                page={this.data}
                              />
                            ) : (
                              <docs-choose-anchor page={this.data} />
                            )}
                          </amplify-toc-contents>
                        </amplify-sidebar-layout-main>
                      ) : (
                        [
                          <amplify-sidebar-layout-main
                            slot="main"
                            class={mainStyle}
                          >
                            <amplify-toc-contents>
                              {this.data && [
                                <h1>{this.data.title}</h1>,
                                createVNodesFromHyperscriptNodes(
                                  this.data.body,
                                ),
                                <docs-next-previous
                                  key={this.data.route}
                                  page={this.data}
                                />,
                              ]}
                            </amplify-toc-contents>
                            <amplify-sidebar-layout-toggle
                              onClick={ensureMenuScrolledIntoView}
                              in-view-class="in-view"
                              class={{
                                "three-dee-effect": true,
                                [sidebarToggleClass]: true,
                              }}
                            >
                              <img
                                class="burger-graphic"
                                src="/assets/burger.svg"
                              />
                              <img class="ex-graphic" src="/assets/close.svg" />
                            </amplify-sidebar-layout-toggle>
                          </amplify-sidebar-layout-main>,
                          !this.data?.disableTOC && (
                            <div slot="toc" class={tocStyle}>
                              <div>
                                <amplify-toc pageTitle={this.data?.title} />
                              </div>
                            </div>
                          ),
                        ]
                      )}
                    </amplify-sidebar-layout>
                  </amplify-toc-provider>
                </div>,
                <docs-footer />,
              ]
            : this.data && createVNodesFromHyperscriptNodes(this.data.body)}
          <docs-chat-button />
        </pageContext.Provider>
      </Host>
    );
  }
}
