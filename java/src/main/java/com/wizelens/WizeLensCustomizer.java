package com.wizelens;

import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.sdk.autoconfigure.spi.AutoConfigurationCustomizer;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.sdk.autoconfigure.spi.AutoConfigurationCustomizerProvider;

/**
 * Loaded by the OpenTelemetry Java agent ({@code -Dotel.javaagent.extensions=wizelens.jar}) or by SDK autoconfigure:
 * WizeLens defaults, then the sampler in front of the span and log exporters.
 */
public final class WizeLensCustomizer implements AutoConfigurationCustomizerProvider {
  private final WizeLensSettings settings;

  public WizeLensCustomizer() {
    this(WizeLensSettings.fromEnvironment());
  }

  public WizeLensCustomizer(WizeLensSettings settings) {
    this.settings = settings;
  }

  @Override
  public void customize(AutoConfigurationCustomizer customizer) {
    customizer.addPropertiesSupplier(() -> WizeLensDefaults.properties(settings));
    if (!settings.enabled()) return;
    if (settings.project() != null) {
      Resource project = Resource.create(Attributes.of(AttributeKey.stringKey("wizelens.project"), settings.project()));
      customizer.addResourceCustomizer((resource, config) -> project.merge(resource));
    }
    TraceSampler sampler = new TraceSampler(settings.sampleRate());
    customizer.addSpanProcessorCustomizer(
        (processor, config) -> new SamplingSpanProcessor(processor, sampler, settings.keepErrors(), settings.keepSlowMs()));
    customizer.addLogRecordProcessorCustomizer(
        (processor, config) -> new SamplingLogRecordProcessor(processor, sampler, settings.keepErrors()));
  }

  @Override
  public int order() {
    // Before other customizers, so their own properties win over these defaults.
    return -100;
  }
}
