// PostCSS RFS plugin
//
// Automated font-resizing
//
// See https://github.com/twbs/rfs

'use strict';

const postcss = require('postcss');

module.exports = postcss.plugin('postcss-rfs', function (opts) {
  const BREAKPOINT_ERROR = 'breakpoint option is invalid, it must be set in `px`, `rem` or `em`.';
  const BREAKPOINT_UNIT_ERROR = 'breakpointUnit option is invalid, it must be `px`, `rem` or `em`.';
  const BASE_FONT_SIZE_ERROR = 'baseFontSize option is invalid, it must be set in `px` or `rem`.';
  const DISABLE_RESPONSIVE_FONT_SIZE_SELECTOR = '.disable-responsive-font-size';
  const ENABLE_RESPONSIVE_FONT_SIZE_SELECTOR = '.enable-responsive-font-size';
  const defaultOptions = {
    baseFontSize: 20,
    fontSizeUnit: 'rem',
    breakpoint: '75rem',
    breakpointUnit: 'px',
    factor: 10,
    twoDimensional: false,
    unitPrecision: 5,
    remValue: 16,
    propList: ['responsive-font-size', 'rfs'],
    class: false,
    safariIframeResizeBugFix: false,
    enableResponsiveFontSizes: true
  };
  opts = Object.assign(defaultOptions, opts);

  if (typeof opts.baseFontSize !== 'number') {
    if (opts.baseFontSize.endsWith('px')) {
      opts.baseFontSize = parseFloat(opts.baseFontSize);
    }
    else if (opts.baseFontSize.endsWith('rem')) {
      opts.baseFontSize = parseFloat(opts.baseFontSize) / opts.remValue;
    }
    else {
      console.error(BASE_FONT_SIZE_ERROR);
    }
  }

  if (typeof opts.breakpoint !== 'number') {
    if (opts.breakpoint.endsWith('px')) {
      opts.breakpoint = parseFloat(opts.breakpoint);
    }
    else if (opts.breakpoint.endsWith('em')) {
      opts.breakpoint = parseFloat(opts.breakpoint) * opts.remValue;
    }
    else {
      console.error(BREAKPOINT_ERROR);
    }
  }

  return function (css) {

    css.walkRules(function (rule) {

      if (rule.selector.includes(DISABLE_RESPONSIVE_FONT_SIZE_SELECTOR)) {
        return;
      }

      rule.walkDecls(function (decl) {
        // Skip if property is not in propList
        if (opts.propList.indexOf(decl.prop) === -1) {
          return;
        }

        // Set property to font-size
        decl.prop = 'font-size';

        // Skip if value is not in px or rem
        if (isNaN(decl.value) && !new RegExp(/(\d*\.?\d+)(px|rem)/g).test(decl.value)) {
          return;
        }

        // Get the float value of the value
        let value = parseFloat(decl.value);

        // Multiply by remValue if value is in rem
        if (decl.value.indexOf('rem') > -1) {
          value *= opts.remValue;
        }

        // Render value in desired unit
        if (opts.fontSizeUnit === 'px') {
          decl.value = toFixed(value, opts.unitPrecision) + 'px';
        }
        else if (opts.fontSizeUnit === 'rem') {
          decl.value = toFixed(value / opts.remValue, opts.unitPrecision) + 'rem';
        }
        else {
          console.error('fontSizeUnit option is not valid, it must be `px` or `rem`.');
        }

        // Only add media query if needed
        if (opts.baseFontSize >= value || opts.factor <= 1 || !opts.enableResponsiveFontSizes) {
          return;
        }

        // Calculate font-size and font-size difference
        let baseFontSize = opts.baseFontSize + (value - opts.baseFontSize) / opts.factor;
        const fontSizeDiff = value - baseFontSize;

        // Divide by remValue if needed
        if (opts.fontSizeUnit === 'rem') {
          baseFontSize /= opts.remValue;
        }

        const viewportUnit = opts.twoDimensional ? 'vmin' : 'vw';

        value = 'calc(' + toFixed(baseFontSize, opts.unitPrecision) + opts.fontSizeUnit + ' + ' + toFixed((fontSizeDiff * 100 / opts.breakpoint), opts.unitPrecision) + viewportUnit + ')';

        const mediaQuery = postcss.atRule(renderMediaQuery(opts));
        let rule_selector = rule.selector;

        // Prefix with .enable-responsive-font-size class if needed
        if (opts.class === 'enable') {
          const selectors = rule.selector.split(',');
          let ruleSelector = '';

          for (let selector of selectors) {
            ruleSelector += ENABLE_RESPONSIVE_FONT_SIZE_SELECTOR + ' ' + selector + ',\n';
            ruleSelector += selector + ENABLE_RESPONSIVE_FONT_SIZE_SELECTOR + ',\n';
          }
          rule_selector = ruleSelector.slice(0, -2);
        }


        const mediaQueryRule = postcss.rule({
          selector: rule_selector,
          source: rule.source
        });
        mediaQueryRule.append(decl.clone({value: value}));

        // Safari iframe resize bug: https://github.com/twbs/rfs/issues/14
        if (opts.safariIframeResizeBugFix) {
          mediaQueryRule.append(postcss.decl({ prop: 'min-width', value: '0vw' }));
        }

        mediaQuery.append(mediaQueryRule);
        rule.parent.insertAfter(rule, mediaQuery.clone());

        // Disable classes
        if (opts.class === 'disable') {
          const selectors = rule.selector.split(',');
          let ruleSelector = '';

          for (let selector of selectors) {
            ruleSelector += selector + ',\n';
            ruleSelector += DISABLE_RESPONSIVE_FONT_SIZE_SELECTOR + ' ' + selector + ',\n';
            ruleSelector += selector + DISABLE_RESPONSIVE_FONT_SIZE_SELECTOR + ',\n';
          }
          ruleSelector = ruleSelector.slice(0, - 2);

          const dc_rule = postcss.rule({
            selector: ruleSelector,
            source: rule.source
          });

          dc_rule.append(decl.clone());
          rule.parent.insertAfter(rule, dc_rule);
          decl.prev() || decl.next() ? decl.remove() : decl.parent.remove();
        }
      });
    });

  };

  function renderMediaQuery (opts) {
    const mediaQuery = {
      name: 'media'
    };

    switch (opts.breakpointUnit) {
      case 'em':
      case 'rem':
        const breakpoint = opts.breakpoint / opts.remValue;

        if (opts.twoDimensional) {
          mediaQuery.params = '(max-width: ' + breakpoint + opts.breakpointUnit + '), (max-height: ' + breakpoint + opts.breakpointUnit + ')';
        }
        else {
          mediaQuery.params = '(max-width: ' + breakpoint + opts.breakpointUnit + ')';
        }
        break;

      case 'px':
        if (opts.twoDimensional) {
          mediaQuery.params = '(max-width: ' + opts.breakpoint + 'px), (max-height: ' + opts.breakpoint + 'px)';
        }
        else {
          mediaQuery.params = '(max-width: ' + opts.breakpoint + 'px)';
        }
        break;

      default:
        console.error(BREAKPOINT_UNIT_ERROR);
        break;
    }

    return mediaQuery;
  }

  function toFixed (number, precision) {
    const multiplier = Math.pow(10, precision + 1),
      wholeNumber = Math.floor(number * multiplier);
    return Math.round(wholeNumber / 10) * 10 / multiplier;
  }
});
