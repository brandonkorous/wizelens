# A plain image of the sample. It knows nothing about WizeLens; the Kubernetes webhook adds it.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY AutoDotnet.csproj Program.cs ./
RUN dotnet publish AutoDotnet.csproj -c Release -o /out

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /out .
ENV ConnectionStrings__Shop="Data Source=/tmp/shop.db"
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "AutoDotnet.dll"]
