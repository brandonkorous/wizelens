package com.wizelens.samples.orders;

import com.wizelens.servlet.WizeLensBodyFilter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.web.client.RestClient;

/**
 * Sample Java service for WizeLens. Run it with the OpenTelemetry Java agent and the WizeLens extension:
 *
 * <pre>
 * java -javaagent:opentelemetry-javaagent.jar -Dotel.javaagent.extensions=wizelens.jar -jar target/orders-java-0.0.0.jar
 * </pre>
 */
@SpringBootApplication
public class OrdersApplication {
  public static void main(String[] args) {
    SpringApplication.run(OrdersApplication.class, args);
  }

  /** Request and response bodies on the server span, when WIZELENS_CAPTURE_BODY=true. */
  @Bean
  FilterRegistrationBean<WizeLensBodyFilter> wizelensBodies() {
    return new FilterRegistrationBean<>(new WizeLensBodyFilter());
  }

  @Bean
  RestClient downstream(@Value("${downstream.url}") String url) {
    return RestClient.builder().baseUrl(url).build();
  }
}
